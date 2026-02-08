/**
 * Copy and config for the campus home page: feature bullets and evaluation criteria.
 */
import {
  CalendarCheck,
  PenLine,
  BookOpen,
  Handshake,
  GraduationCap,
  Star,
  ShieldCheck,
  Users,
} from "lucide-react";

/** Icon + text (text can be string or (campusLabel) => string) */
export const FEATURE_ITEMS = [
  { icon: GraduationCap, text: (campus) => `Faculty rating platform for ${campus} students` },
  { icon: Star, text: "Rate faculty and explore anonymous reviews" },
  { icon: ShieldCheck, text: "Your identity is never revealed" },
  { icon: Users, text: "Help others make better academic decisions" },
];

export const INFO_CARDS = [
  {
    title: "Attendance",
    icon: CalendarCheck,
    items: [
      "Flexible attendance policies",
      "Understands genuine student issues",
      "Learning over strict rules",
    ],
  },
  {
    title: "Correction",
    icon: PenLine,
    items: [
      "Fair and unbiased evaluation",
      "Timely correction of answer sheets",
      "Clear justification of marks",
    ],
  },
  {
    title: "Teaching",
    icon: BookOpen,
    items: [
      "Clear explanation of concepts",
      "Comfortable teaching pace",
      "Focus on understanding",
    ],
  },
  {
    title: "Approachability",
    icon: Handshake,
    items: [
      "Easy to approach for doubts",
      "Friendly with students",
      "Helps beyond class hours",
    ],
  },
];
