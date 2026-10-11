import type { ExternalArticle, OpportunityPost } from "./types";

type ResearchPlan = { contribution: string; steps: string[] };
// Hypotheses need different evidence strategies, not just different keywords.
const plans: Record<string, ResearchPlan> = {
  "agents:0": {
    contribution: "Build a liability map for an agent-caused loss: who can prevent it, who pays, and which failures are uninsurable. Propose an allocation of responsibility rather than another list of agent risks.",
    steps: ["Choose one loss scenario, such as an unauthorized payment, and trace control across the model provider, app developer, deployer, and user.", "Read public cyber-insurance exclusions and vendor indemnity terms; separate actual contractual coverage from proposed coverage.", "Ask a cyber underwriter or technology lawyer which logs and controls would make that scenario insurable.", "Compare insured deployment with mandatory human approval; test whether exclusions or correlated failures undermine the insurance case."],
  },
  "agents:1": {
    contribution: "Test whether permission infrastructure can retain pricing power as model inference gets cheaper. Separate indispensable controls from features that model vendors can bundle away.",
    steps: ["Map identity, authorization, monitoring, and inference costs for one enterprise agent workflow.", "Compare public pricing, integration requirements, and switching costs for a standalone control provider and a bundled platform.", "Interview an enterprise buyer about who owns the budget and whether security controls change purchasing decisions.", "Construct a margin comparison under falling inference prices; challenge the thesis with a free bundled permission layer."],
  },
  "agents:2": {
    contribution: "Measure human approval as a queueing problem: does automation save execution time only to create a new review bottleneck? Identify which decisions deserve scarce human attention.",
    steps: ["Diagram one approval-heavy workflow and estimate arrival rate, reviewer capacity, and time spent waiting versus executing.", "Compare blanket approval, risk-tiered review, and exception-only escalation using an explicitly hypothetical workload.", "Ask an operations manager how false alarms, reviewer fatigue, and responsibility affect throughput.", "Test whether more autonomy reduces total cycle time once rework and serious errors are included."],
  },
  "agents:3": {
    contribution: "Propose an auditable agent stress test with observable pass/fail criteria. Distinguish a reproducible control test from a vendor's safety demonstration.",
    steps: ["Specify a sandbox workflow, its permitted actions, and the harm the test is meant to prevent.", "Create sandbox tests for prompt injection, privilege escalation, missing logs, and emergency shutdown; never run them on real accounts.", "Compare the evidence trail with public financial-audit requirements and ask an auditor what remains unverifiable.", "Repeat the tests after a model or tool update; identify failures that a one-time certification would miss."],
  },
  "macro:0": {
    contribution: "Separate financing sensitivity from AI demand: show which business models fail because capital becomes expensive rather than because customers stop buying.",
    steps: ["Select a capital-heavy infrastructure company and an asset-light AI service with public financial disclosures.", "Compare debt maturities, cash runway, capital expenditure, and customer commitments using filings rather than headline valuations.", "Model financing-rate and demand shocks separately, labeling assumptions and avoiding false precision.", "Check whether utilization or customer concentration explains more of the downside than interest rates."],
  },
  "macro:1": {
    contribution: "Locate the balance-sheet bottleneck between fast automated decisions and slow settlement or redemption. Show who must fund the gap and when speed amplifies fragility.",
    steps: ["Trace an automated trade or redemption from decision to settled cash, marking each financing and settlement delay.", "Use exchange rules, clearing documentation, or fund terms to verify timing and collateral requirements.", "Build a timeline of a liquidity shock and estimate the funding gap under faster correlated decisions.", "Ask a market-operations practitioner whether netting, prefunding, or circuit breakers remove the mismatch."],
  },
  "macro:2": {
    contribution: "Create a revised definition of a defensive business that includes automation exposure. Stable historical demand may conceal a vulnerable cost structure or a newly contestable moat.",
    steps: ["Choose two traditionally defensive businesses with different reliance on routine labor and protected distribution.", "Compare customer retention, margins, labor intensity, and implementation costs in public disclosures.", "Map whether automation strengthens the incumbent or makes a low-cost entrant viable.", "Test the revised classification against a recession scenario and a slow-adoption scenario; report where the classifications disagree."],
  },
  "macro:3": {
    contribution: "Build a transparent stress-test matrix for the AI capital cycle, identifying the interaction of financing, utilization, power availability, and customer concentration.",
    steps: ["Select one infrastructure project or operator and establish disclosed capacity, debt, customer commitments, and energy needs.", "Construct separate shocks to refinancing costs, utilization, electricity availability, and the largest customer's spending.", "Combine the shocks to locate cash-flow breakpoints; label missing inputs instead of inventing figures.", "Compare the model with cancellations, contract protections, or alternative uses of capacity that could soften the downside."],
  },
  "quant:0": {
    contribution: "Distinguish cheaper signal discovery from durable trading profits. Trace whether wider access accelerates crowding, erodes capacity, or merely lowers research costs.",
    steps: ["Choose one publicly documented signal and distinguish its publication date from its historical backtest window.", "Compare performance before and after publication, accounting for transaction costs and market conditions.", "Estimate capacity using turnover, market depth, and execution constraints rather than headline returns.", "Seek evidence that improved implementation offsets crowding; treat any association between AI adoption and returns as unproven."],
  },
  "quant:1": {
    contribution: "Develop an evidence audit for AI investment research: separate a persuasive explanation from a prediction that survives point-in-time data, holdout testing, and regime changes.",
    steps: ["Choose one AI-assisted investment claim and record its prediction, data cutoff, and falsification criterion before testing.", "Audit data provenance for look-ahead leakage, revised data, survivorship bias, and inaccessible supporting citations.", "Compare an untouched holdout result with a simple baseline, including fees and slippage where relevant.", "Repeat across contrasting regimes and show where the story remains convincing despite the forecast failing."],
  },
  "quant:2": {
    contribution: "Examine liquidity as an interaction between correlated agent orders and market-maker inventory limits, not simply a claim that more automated traders create more liquidity.",
    steps: ["Specify contrasting scenarios: diverse agents with independent signals versus agents reacting to the same model output.", "Use public order-book or trade data to distinguish quoted depth, realized spread, and liquidity during stress.", "Model simultaneous orders against limited dealer inventory and compare staggered execution or limit-order policies.", "Ask a market maker what would invalidate the crowding scenario; distinguish a mechanism sketch from an empirical forecast."],
  },
  "bio:0": {
    contribution: "Identify the boundary where software permissions become permission to perform a physical experiment. Map gaps between cybersecurity and biological safety governance without providing harmful protocols.",
    steps: ["Diagram a benign automated-lab workflow from digital request through authorization, instrument execution, and review.", "Compare documented access-control practices with biosafety approval and incident-reporting procedures.", "Ask a lab-automation specialist where instructions, credentials, or audit trails cross organizational boundaries.", "Propose non-operational control checks and test whether existing human review already closes the apparent gap."],
  },
  "bio:1": {
    contribution: "Test whether biosecurity changes commercial outcomes for discovery platforms, rather than assuming safeguards are either pure cost or an automatic competitive moat.",
    steps: ["Identify a public procurement or partnership decision where a discovery platform's safeguards could be relevant.", "Compare published requirements, certification claims, and screening commitments across competing platforms.", "Interview a buyer or compliance lead about whether safeguards affect vendor selection, contracting, or timelines.", "Look for cases where strong safeguards do not win business; separate reputational claims from observed purchasing behavior."],
  },
  "bio:2": {
    contribution: "Follow the bottleneck from computational discovery to clinical value creation. Show whether faster candidate generation improves returns or just feeds a slower, capital-intensive pipeline.",
    steps: ["Select a disclosed AI-origin drug program and construct its discovery, trial, manufacturing, and financing timeline.", "Check trial registries and company filings for milestones, enrollment requirements, and remaining capital needs.", "Compare with a matched conventional program, explaining differences in indication and development stage.", "Test whether discovery savings matter once clinical failure rates, dilution, and time to market are included."],
  },
  "culture:0": {
    contribution: "Investigate productive disagreement by comparing what consensus-seeking AI preserves, flattens, or excludes in criticism and comedy. Make the argument through close reading, not an abstract verdict on AI culture.",
    steps: ["Select a short critical or comic passage from your existing coverage and identify its tension, ambiguity, or unpopular judgment.", "Compare several AI interpretations of the same passage, recording prompts and distinguishing model behavior from claims about all AI.", "Assess changes in irony, disagreement, and specificity through close reading; include a human consensus-seeking comparison.", "Find a counterexample in which AI sharpens disagreement or a human critic flattens it, then revise the thesis accordingly."],
  },
  "culture:1": {
    contribution: "Turn the claim that universities teach judgment into a testable institutional proposition: which seminar or mentorship practices produce something cheap information cannot substitute for?",
    steps: ["Choose a small institution or seminar model and define judgment through observable work, not promotional language.", "Compare published syllabi and assessment practices with an information-delivery course or AI-supported alternative.", "Interview a teacher and a student about feedback, disagreement, revision, and the costs of intensive mentorship.", "Look for evidence that the alternative teaches judgment equally well; distinguish educational value from willingness to pay."],
  },
  "culture:2": {
    contribution: "Separate the abundance of content from the scarcity of trustworthy selection. Test whether human taste earns value through saved attention, credible judgment, or social identity, and where those explanations diverge.",
    steps: ["Choose one recommendation or reading list from your archive and articulate the selection rule behind it.", "Compare a human curator and an algorithmic or AI alternative using relevance, surprise, trust, and time saved rather than output volume.", "Examine public subscription prices or commissioning practices and interview a curator about what readers actually pay for.", "Seek a case where automated selection matches or beats the curator; determine whether trust or identity still sustains a premium."],
  },
};

const cases: Record<string, ResearchPlan> = {
  agents: { contribution: "Map {entity}'s permission boundary: which actor can authorize a consequential action, revoke access, and accept responsibility when it fails?", steps: ["Choose a documented {entity} integration and list its requested permissions, data access, and tool actions.", "Read official access-control and logging documentation; distinguish shipped controls from promises or roadmap items.", "Trace a hypothetical benign authorization failure through the user, integrator, and provider without executing it on live accounts.", "Ask an integrator whether a narrower permission model would prevent the failure or merely move responsibility elsewhere."] },
  macro: { contribution: "Reconstruct the capital-allocation case for {entity} and identify which operating assumption must hold for committed capital to earn a return.", steps: ["Locate {entity}'s public financing disclosures, capacity commitments, and customer economics; flag unavailable information.", "Separate committed capacity from realized demand, then estimate the utilization assumption behind the investment story.", "Compare a demand slowdown with a financing-cost shock to locate the more consequential cash-flow constraint.", "Look for contract protections or alternate uses of capacity that would disprove the apparent downside."] },
  quant: { contribution: "Make the investment story around {entity} falsifiable by translating its narrative into dated operating milestones and valuation assumptions.", steps: ["State the investment claim about {entity} as a measurable milestone and a deadline, not a price prediction.", "Verify the baseline with public filings or primary disclosures and distinguish expectations from achieved results.", "Compare downside, base, and upside assumptions with a relevant peer and a simple alternative explanation.", "Identify an observable result that would invalidate the thesis and check how sensitive it is to valuation rather than operating progress."] },
  bio: { contribution: "Trace whether {entity}'s reported discovery progress removes a development bottleneck or shifts it into clinical validation and manufacturing.", steps: ["Identify the specific {entity} program or claim and its development stage from primary disclosures.", "Check trial registries, regulatory documents, and manufacturing milestones for the next unresolved gate.", "Compare the timeline with a matched program, controlling for indication and stage where public evidence permits.", "Test whether faster discovery changes time to approval or capital needs; explicitly report missing clinical evidence."] },
  culture: { contribution: "Use {entity} as a concrete case of attention allocation: who selects, who gains visibility, and what kind of judgment the selection mechanism rewards.", steps: ["Choose a publicly observable {entity} recommendation or cultural artifact and describe its selection mechanism.", "Compare what receives attention with a human-curated alternative, using specific examples rather than inferred intent.", "Examine public business-model evidence and ask a critic or curator whether incentives shape the selections.", "Find an example that resists the incentive story and revise the interpretation to accommodate it."] },
};

export function researchPlan(key: string, sources: ExternalArticle[], related: OpportunityPost[], entity?: string): ResearchPlan {
  const [theme, variant] = key.split(":");
  const base = variant === "case" ? cases[theme] : plans[key];
  if (!base || (variant === "case" && !entity)) throw new Error("Missing research plan: " + key);
  const plan = { contribution: base.contribution.replaceAll("{entity}", entity ?? ""), steps: base.steps.map(s => s.replaceAll("{entity}", entity ?? "")) };
  const source = sources[0], own = related[0];
  return {
    contribution: plan.contribution,
    steps: plan.steps.map((step, i) => i === 0 && source ? step + ' Starting reference: "' + source.title + '" (' + (source.text ? "accessible public text" : "title/subtitle only; read the article before attributing an argument") + ")." : i === plan.steps.length - 1 && own ? step + ' Connect the result back to "' + (own.subtitle || own.title) + '" and state what the new analysis adds.' : step),
  };
}
