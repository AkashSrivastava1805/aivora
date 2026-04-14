import { Restriction } from "../models/Restriction.js";
import { Relationship } from "../models/Relationship.js";
import { User } from "../models/User.js";
import { History } from "../models/History.js";
import { recordStudentEvent } from "../utils/studentMonitoring.js";

function hasBlockedKeyword(blockedKeywords, query = "") {
  const normalizedQuery = query.toLowerCase();
  return blockedKeywords.some((keyword) => normalizedQuery.includes(keyword.toLowerCase()));
}

function hasBlockedDomain(blockedDomains, url = "") {
  return blockedDomains.some((domain) => url.includes(domain));
}

export async function enforceStudentRestrictions(req, res, next) {
  if (req.user.role !== "student") return next();

  const relationship = await Relationship.findOne({ studentId: req.user._id });
  if (!relationship) return next();
  req.relationship = relationship;

  const restriction = await Restriction.findOne({ parentId: relationship.parentId });
  if (!restriction) return next();

  const { query, url } = req.body;
  const blockedKeyword = hasBlockedKeyword(restriction.blockedKeywords, query);
  const blockedDomain = hasBlockedDomain(restriction.blockedDomains, url);

  if (blockedKeyword || blockedDomain) {
    if (query) {
      await History.findOneAndUpdate(
        { userId: req.user._id },
        { $push: { searches: { query, blocked: true, createdAt: new Date() } } },
        { upsert: true, new: true }
      );
    }

    if (url) {
      await History.findOneAndUpdate(
        { userId: req.user._id },
        {
          $push: {
            visitedUrls: {
              url,
              title: "Blocked URL",
              blocked: true,
              durationSeconds: 0,
              createdAt: new Date()
            }
          }
        },
        { upsert: true, new: true }
      );
    }

    await recordStudentEvent(req, {
      type: blockedKeyword ? "SEARCH_BLOCKED" : "DOMAIN_BLOCKED",
      status: "blocked",
      details: blockedKeyword ? `Blocked query: ${query}` : `Blocked domain URL: ${url}`
    });

    return res.status(403).json({
      message: "Blocked by parental control policy",
      blockedKeyword,
      blockedDomain
    });
  }

  req.restriction = restriction;
  req.parent = await User.findById(relationship.parentId).select("_id email name");
  next();
}
