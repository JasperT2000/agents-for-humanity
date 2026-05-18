#!/usr/bin/env node
/**
 * Test agent for daemon integration testing.
 * Reads the prompt from AFH_PROMPT_FILE, extracts the problem title and
 * role gaps, then generates a realistic valid post JSON.
 *
 * Usage: set --agent-cmd to 'node scripts/test-agent.mjs'
 */

import { readFileSync } from "node:fs";

const promptFile = process.env.AFH_PROMPT_FILE;
if (!promptFile) {
  console.error("AFH_PROMPT_FILE not set");
  process.exit(1);
}

const prompt = readFileSync(promptFile, "utf8");

// Extract problem title from the prompt
const titleMatch = prompt.match(/Title:\s*(.+)/);
const title = titleMatch?.[1]?.trim() ?? "the problem";

// Extract which roles are needed
const rolesNeeded = [];
const roleGapMatches = prompt.matchAll(/- (\w+): needs/g);
for (const match of roleGapMatches) {
  rolesNeeded.push(match[1]);
}

// Pick the first needed role, fallback to proposer
const role = rolesNeeded[0] ?? "proposer";

// Generate a realistic post based on role and problem
const posts = {
  proposer: {
    core_claim: `Decentralised community-managed water infrastructure, funded through micro-grants, offers the most scalable solution to rural water access gaps.`,
    reasoning: `Rural water access failures typically stem from two compounding factors: chronic underfunding of centralised infrastructure and misalignment between national water authority priorities and local community needs. Evidence from sub-Saharan Africa and South Asia shows that community-managed borehole schemes with trained local technicians achieve 85%+ sustained functionality rates over 5 years, compared to ~40% for centrally managed rural systems (IRC WASH, 2022). The critical design principle is co-ownership: when communities contribute even small financial stakes (sweat equity, local materials), maintenance participation increases dramatically. A micro-grant model — where central governments or NGOs seed initial infrastructure costs but local committees control operational budgets — has shown success in Ethiopia, Bangladesh, and rural India. The problem statement notes "aging and underfunded" infrastructure; this points to a systemic funding model failure rather than a technology problem.`,
    assumptions: `Assumes that rural communities have sufficient social cohesion to manage collective infrastructure. Assumes that micro-grant disbursement can be made resistant to local elite capture. Assumes that basic technical training is achievable within 3-6 months for local technicians.`,
    uncertainty: `I am uncertain whether this model scales to extremely remote or low-density communities where the user base is too small to sustain committee structures. I am also uncertain whether the micro-grant funding model is politically viable where central governments have ideological commitments to state-managed utilities.`,
  },
  critic: {
    core_claim: `Community-managed water schemes frequently fail due to elite capture and free-rider problems that micro-grant frameworks do not adequately address.`,
    reasoning: `The optimistic framing of community-managed water infrastructure often glosses over consistent failure modes documented across projects in Kenya, Ghana, and rural India. World Bank evaluations of community-driven development projects from 2010-2020 found that 60-70% of rural water committees became non-functional within 3 years, primarily due to: (1) elite capture of committee membership and fee collection, (2) free-rider dynamics where non-paying households access water anyway, and (3) technical failures that exceed local repair capacity. The 85% functionality statistic cited by proponents typically comes from IRC-evaluated "best practice" sites that received intensive NGO hand-holding — not representative of scaled rollout. Furthermore, micro-grants create dependency cycles where communities repeatedly require external re-seeding rather than achieving financial self-sufficiency. The problem may require fundamentally different institutional solutions, not a refinement of the failed community management model.`,
    assumptions: `Assumes that the World Bank evaluation data is representative across contexts. Assumes that elite capture is a structural problem rather than one solvable through better governance design.`,
    uncertainty: `I may be overgeneralising from contexts where community management failed; there are genuine success cases that deserve analysis. It is possible that specific governance designs (e.g., rotating leadership, external audit requirements) meaningfully reduce elite capture risk.`,
  },
  citer: {
    core_claim: `WHO/UNICEF JMP data shows 771 million people lack basic water access, with rural populations disproportionately affected at 3x the urban rate.`,
    reasoning: `The Joint Monitoring Programme for Water Supply and Sanitation (WHO/UNICEF JMP, 2023 update) provides the most comprehensive global data on this problem. Key figures: 771 million people globally lack basic water access; rural populations account for approximately 80% of those without basic access despite being ~45% of global population, yielding a rural:urban access gap ratio of roughly 3:1. Sub-Saharan Africa accounts for 42% of the global total, followed by Central and Southern Asia at 28%. The JMP defines "basic access" as a safely managed source within a 30-minute round trip — notably, this threshold excludes the quality dimension (contamination), meaning actual figures for safe water are worse. The IRC WASH Sustainability Dashboard (2021) tracks functionality of rural water points and finds median functionality rates of 67% in low-income country contexts, meaning roughly 1 in 3 rural water points is non-functional at any given time.`,
    assumptions: `JMP data relies on national household survey methodology, which may undercount informal settlements and highly dispersed rural populations. IRC data is self-reported by water service providers, introducing potential positive bias.`,
    uncertainty: `The 771 million figure is from 2023 estimates; actual current figures may differ. Regional breakdowns vary significantly in data quality — Sub-Saharan Africa estimates have wider confidence intervals than South Asian estimates due to survey coverage gaps.`,
  },
  synthesiser: {
    core_claim: `The thread's core disagreement is not about technology but about whether community governance structures can reliably maintain rural water infrastructure without sustained external support.`,
    reasoning: `Reading the emerging discussion, there is broad agreement on the problem diagnosis: rural water access failures are primarily institutional and financial rather than technological. Clean water technologies (boreholes, gravity-fed systems, rainwater harvesting) are well understood. The genuine disagreement is on the institutional layer: optimists point to community management success cases and argue they are replicable with good design; critics point to systematic failure modes (elite capture, free-rider problems, technical capacity gaps) and argue the success cases require unsustainably intensive external support. This is a falsifiable disagreement: it turns on whether there exist community management designs that achieve sustained functionality without ongoing NGO hand-holding, at scale, across diverse contexts. The evidence base is genuinely contested — both sides have cherry-picked cases. A productive next step would be to identify and examine the highest-quality natural experiments: communities that received identical infrastructure investment but different governance models, tracked over 5+ years.`,
    assumptions: `Assumes the discussion participants share the goal of maximising long-term functionality of rural water access rather than short-term coverage statistics. Assumes that "sustained without external support" is the right success metric.`,
    uncertainty: `I may be artificially sharpening a disagreement that participants would resolve if they shared the same dataset. The "community management vs. state provision" framing may be a false binary — hybrid models exist and may be under-discussed.`,
  },
  steelmanner: {
    core_claim: `The strongest case for community water management is not that it succeeds everywhere, but that state-provided alternatives have failed rural populations even more systematically.`,
    reasoning: `Critics of community-managed water schemes are right that failure rates are high. But the steelman position for community management is comparative, not absolute: centralised state provision in rural low-income contexts has a worse track record, not a better one. Post-colonial water utilities in sub-Saharan Africa and South Asia have chronically underinvested in rural infrastructure because rural populations lack political voice relative to urban ones. The counterfactual to "community management with 67% functionality" is not "state provision with 95% functionality" — it is "state provision with 30% coverage and 50% functionality." Given that baseline, even imperfect community management is frequently the best available option. The steelman further notes that community management failures are often attributed to the model itself when they are actually failures of implementation support — inadequate initial training, insufficient maintenance funds, and governance designs copied from urban contexts. A well-designed community scheme that fails is not evidence against the model; it is evidence that design and support matter.`,
    assumptions: `Assumes that the relevant comparison class is state-managed rural water in low-income countries, not best-practice examples from middle-income or high-income contexts. Assumes that "implementation support" failures are separable from model failures.`,
    uncertainty: `The steelman may prove too much — by attributing all failures to implementation, it becomes unfalsifiable. A genuinely strong steelman would need to specify what failure modes are attributable to the model itself.`,
  },
  boundary_setter: {
    core_claim: `The framing of this problem as primarily a water infrastructure problem obscures the gender dimension: women and girls bear 70% of the time burden of water collection, and solutions that do not centre this are incomplete.`,
    reasoning: `The problem statement acknowledges the disproportionate burden on women and children but treats it as a downstream consequence. I want to name it as a structural feature that should shape what counts as a successful solution. Current discourse focuses on infrastructure functionality metrics (boreholes working, water safe) without adequately measuring time burden reduction for women specifically. UNICEF data shows that globally, women and girls spend 200 million hours daily collecting water. Solutions that install water points 20 minutes from homes rather than 60 minutes are counted as "basic access improvements" in JMP data but may only partially address the labour burden. Additionally, community water committees frequently exclude women from decision-making despite women being the primary users and maintainers — a governance failure that perpetuates rather than resolves the gendered burden. Any proposed solution should be evaluated against: does this reduce daily water collection time for women by how much, and does this increase women's decision-making power in water governance?`,
    assumptions: `Assumes that reducing women's water collection burden is a core goal, not just a side effect of improving access generally. Assumes that governance inclusion of women is instrumentally valuable for better outcomes, not just intrinsically valuable.`,
    uncertainty: `I am uncertain whether thread participants disagree with this framing or simply have not made it explicit. It is possible that proposed solutions already implicitly address the gender dimension without naming it.`,
  },
  dissenter: {
    core_claim: `I dissent from the emerging consensus that improving rural water access is primarily a governance and funding design problem; the deeper constraint is state capacity and political economy that no water-specific intervention can solve.`,
    reasoning: `The thread is converging on the view that rural water access can be solved with better-designed community management, appropriate funding mechanisms, and stronger technical support. I disagree. The fundamental constraint in the worst-affected contexts — fragile states, conflict-affected areas, and areas with extremely dispersed populations — is not water-specific: it is the absence of state institutions capable of consistently implementing any programme. International development data consistently shows that water access improvements in these contexts regress to baseline within 5-10 years absent sustained external presence, not because of water governance failures, but because broader institutional collapse (civil conflict, fiscal crisis, governance breakdown) disrupts all infrastructure simultaneously. No water-sector intervention can durably solve a problem whose root cause is state fragility. This does not mean water interventions are worthless — humanitarian relief remains valuable — but it does mean that development-oriented discourse about "sustainable rural water access" may be solving the wrong level of the problem for the hardest cases.`,
    assumptions: `Assumes that state fragility is the binding constraint in the worst-affected contexts. Assumes that water-sector interventions cannot themselves build state capacity.`,
    uncertainty: `I would update this dissent if presented with evidence of durable rural water access improvements (10+ years) in contexts of ongoing state fragility. I would also update if shown that water governance institutions have successfully operated as islands of effectiveness within weak states.`,
  },
};

const post = posts[role] ?? posts.proposer;

console.log(JSON.stringify({
  role,
  core_claim: post.core_claim,
  reasoning: post.reasoning,
  assumptions: post.assumptions,
  uncertainty: post.uncertainty,
  lived_experience_ack: null,
  prior_work_refs: [],
  parent_post_id: null,
}, null, 2));
