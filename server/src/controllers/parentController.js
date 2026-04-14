import { History } from "../models/History.js";
import { Relationship } from "../models/Relationship.js";
import { Restriction } from "../models/Restriction.js";
import { User } from "../models/User.js";

export async function linkStudent(req, res) {
  const { studentEmail } = req.body;
  if (!studentEmail || !studentEmail.trim()) {
    return res.status(400).json({ message: "Student email is required" });
  }

  const student = await User.findOne({ email: studentEmail, role: "student" });
  if (!student) return res.status(404).json({ message: "Student not found" });

  await Relationship.findOneAndUpdate(
    { parentId: req.user._id, studentId: student._id },
    { parentId: req.user._id, studentId: student._id },
    { upsert: true, new: true }
  );

  student.linkedParentId = req.user._id;
  student.linkedParentEmail = req.user.email;
  await student.save();

  res.json({ message: "Student linked", studentId: student._id, studentEmail: student.email });
}

export async function addKeyword(req, res) {
  const { keyword } = req.body;
  if (!keyword || !keyword.trim()) {
    return res.status(400).json({ message: "Keyword is required" });
  }
  const restriction = await Restriction.findOneAndUpdate(
    { parentId: req.user._id },
    { $addToSet: { blockedKeywords: keyword.trim().toLowerCase() } },
    { upsert: true, new: true }
  );
  res.json(restriction);
}

export async function getRestrictions(req, res) {
  const restriction = await Restriction.findOneAndUpdate(
    { parentId: req.user._id },
    { $setOnInsert: { blockedKeywords: [], blockedDomains: [] } },
    { upsert: true, new: true }
  );
  res.json(restriction);
}

export async function removeKeyword(req, res) {
  const { keyword } = req.body;
  if (!keyword || !keyword.trim()) {
    return res.status(400).json({ message: "Keyword is required" });
  }
  const restriction = await Restriction.findOneAndUpdate(
    { parentId: req.user._id },
    { $pull: { blockedKeywords: keyword.trim().toLowerCase() } },
    { new: true }
  );
  res.json(restriction);
}

export async function updateKeyword(req, res) {
  const { oldKeyword, newKeyword } = req.body;
  if (!oldKeyword || !oldKeyword.trim() || !newKeyword || !newKeyword.trim()) {
    return res.status(400).json({ message: "Both oldKeyword and newKeyword are required" });
  }

  const restriction = await Restriction.findOne({ parentId: req.user._id });
  if (!restriction) return res.status(404).json({ message: "Restriction policy not found" });

  const normalizedOld = oldKeyword.trim().toLowerCase();
  const normalizedNew = newKeyword.trim().toLowerCase();
  restriction.blockedKeywords = restriction.blockedKeywords
    .map((item) => (item === normalizedOld ? normalizedNew : item))
    .filter((item, index, arr) => arr.indexOf(item) === index);
  await restriction.save();

  res.json(restriction);
}

export async function blockDomain(req, res) {
  const { domain } = req.body;
  if (!domain || !domain.trim()) {
    return res.status(400).json({ message: "Domain is required" });
  }
  const restriction = await Restriction.findOneAndUpdate(
    { parentId: req.user._id },
    { $addToSet: { blockedDomains: domain.trim().toLowerCase() } },
    { upsert: true, new: true }
  );
  res.json(restriction);
}

export async function removeDomain(req, res) {
  const { domain } = req.body;
  if (!domain || !domain.trim()) {
    return res.status(400).json({ message: "Domain is required" });
  }
  const restriction = await Restriction.findOneAndUpdate(
    { parentId: req.user._id },
    { $pull: { blockedDomains: domain.trim().toLowerCase() } },
    { new: true }
  );
  res.json(restriction);
}

export async function updateDomain(req, res) {
  const { oldDomain, newDomain } = req.body;
  if (!oldDomain || !oldDomain.trim() || !newDomain || !newDomain.trim()) {
    return res.status(400).json({ message: "Both oldDomain and newDomain are required" });
  }

  const restriction = await Restriction.findOne({ parentId: req.user._id });
  if (!restriction) return res.status(404).json({ message: "Restriction policy not found" });

  const normalizedOld = oldDomain.trim().toLowerCase();
  const normalizedNew = newDomain.trim().toLowerCase();
  restriction.blockedDomains = restriction.blockedDomains
    .map((item) => (item === normalizedOld ? normalizedNew : item))
    .filter((item, index, arr) => arr.indexOf(item) === index);
  await restriction.save();

  res.json(restriction);
}

export async function getStudentHistory(req, res) {
  const relationships = await Relationship.find({ parentId: req.user._id });
  const studentIds = relationships.map((row) => row.studentId);
  const histories = await History.find({ userId: { $in: studentIds } })
    .populate("userId", "name email")
    .sort({ updatedAt: -1 });

  const students = await User.find({ _id: { $in: studentIds } }).select("name email");
  const byUserId = new Map(histories.map((entry) => [String(entry.userId?._id || entry.userId), entry]));

  const fullHistory = students.map((student) => {
    const existing = byUserId.get(String(student._id));
    if (existing) return existing;
    return {
      _id: `virtual-${student._id}`,
      userId: student,
      searches: [],
      visitedUrls: [],
      liveEvents: []
    };
  });

  res.json(fullHistory);
}
