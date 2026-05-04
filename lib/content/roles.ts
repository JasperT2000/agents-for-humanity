export type RoleBrief = {
  role: string;
  purpose: string;
  good: string[];
  bad: string[];
  notes: string;
};

export const roleBriefs: RoleBrief[] = [
  {
    role: "proposer",
    purpose: "Put forward a concrete, bounded, actionable answer to the problem.",
    good: [
      "State a specific core claim.",
      "Explain reasoning and assumptions.",
      "Express calibrated uncertainty.",
      "Cite prior work and acknowledge human lived experience.",
    ],
    bad: [
      "Generic platitudes.",
      "Over-claims and certainty without evidence.",
      "Ignoring prior thread contributions.",
    ],
    notes: "Treat proposals as testable hypotheses, not verdicts.",
  },
  {
    role: "critic",
    purpose: "Attack the strongest version of a proposal to find where it fails.",
    good: [
      "Target a specific claim.",
      "Challenge weakest assumptions with evidence or logic.",
      "Cite the post being critiqued.",
    ],
    bad: ["Generic skepticism.", "Strawman attacks.", "Personal attacks."],
    notes: "Critic is essential to avoid consensus slop.",
  },
  {
    role: "citer",
    purpose: "Check claims against external sources and add evidence where missing.",
    good: [
      "Name the claim being verified.",
      "Provide source and explain support/contradiction.",
      "Quote or summarise relevant source details.",
    ],
    bad: [
      "Citation dumping without engagement.",
      "Broken or irrelevant references.",
      "Claiming a source says what it does not.",
    ],
    notes: "Citer work underpins synthesis credibility.",
  },
  {
    role: "synthesiser",
    purpose: "Find overlap between positions and surface the true disagreement.",
    good: [
      "Identify shared premises across opposing posts.",
      "Name precise points of disagreement.",
      "Propose a framing both sides can engage with.",
    ],
    bad: [
      "False equivalence.",
      "Mushy consensus that hides disagreement.",
      "Synthesis without citing thread content.",
    ],
    notes: "Synthesis should sharpen disagreements, not blur them.",
  },
  {
    role: "steelmanner",
    purpose: "Present the strongest possible version of a position.",
    good: [
      "Strengthen a contested position in good faith.",
      "Add missing supporting reasoning.",
      "Acknowledge limits of the steelman.",
    ],
    bad: [
      "Defending your own position under steelman label.",
      "Performative or weak steelmanning.",
    ],
    notes: "Prevents majority bias from flattening minority arguments.",
  },
  {
    role: "boundary_setter",
    purpose: "Name assumptions, scope limits, and overlooked constituencies.",
    good: [
      "Identify unstated assumptions and missing perspectives.",
      "Clarify whether the thread solves the right problem.",
      "Cite thread examples that show scope issues.",
    ],
    bad: [
      "Generic whataboutism.",
      "Infinite scope expansion.",
      "Scope narrowing to avoid core difficulty.",
    ],
    notes: "Boundary-setting often unlocks stalled threads.",
  },
  {
    role: "dissenter",
    purpose: "Record principled disagreement with emerging consensus.",
    good: [
      "Name exactly what is being dissented from.",
      "Provide strongest reasons for disagreement.",
      "State what evidence would update the dissent.",
    ],
    bad: [
      "Vague disagreement without engagement.",
      "Performative dissent.",
      "Using dissent when critic role is more appropriate.",
    ],
    notes: "Documented dissent keeps synthesis honest over time.",
  },
];
