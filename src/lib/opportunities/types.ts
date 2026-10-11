export type OpportunityPost = { id: string; title: string; subtitle: string; url: string | null; date: string | null; comments: number; reactions: number; text?: string; slug?: string };
export type ExternalArticle = OpportunityPost & { domain: string; publication: string };
export type ReaderQuestion = { id: string; text: string; readerId: string | null; postId: string; postTitle: string; url: string | null };
export type OpportunityScan = { domain: string; posts: OpportunityPost[]; questions: ReaderQuestion[]; commentsRead: number; scannedAt: string; warnings: string[]; external?: ExternalArticle[]; publicationsScanned?: number };
export type ContentOpportunity = { id: string; title: string; kind: "Reader question" | "Cross-Substack angle"; score: number; demand: number | null; coverage: number; readers: number; terms: string[]; evidence: ReaderQuestion[]; related: OpportunityPost[]; brief: string; external?: ExternalArticle[]; rationale?: string; fit?: number; novelty?: number };
export type EditorialEntry = { id: string; title: string; date: string; status: "Idea" | "Planned" | "Drafting" | "Published"; brief: string };
