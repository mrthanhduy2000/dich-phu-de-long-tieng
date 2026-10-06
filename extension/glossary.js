// ============================================================
// TU DIEN THUAT NGU DA NGANH
//
// BA TANG SO KHOP:
//  1. Muc TOAN chu thuong    -> khong phan biet hoa thuong
//     ("landing page" khop ca "Landing page" o dau cau)
//  2. Muc CO chu hoa         -> phai dung chu hoa
//     ("Excel" khong khop "excel" nghia vuot troi)
//  3. Muc trong RISKY_PROPER -> dung chu hoa VA khong duoc o dau cau
//     ("Notion" giua cau la ten app, dau cau co the la "notion" thuong)
//
// KHONG BAO GIO dua tu don da nghia vao day (make, lead, run, scale,
// model, share, reach, target, value, return, form, pivot...).
// ============================================================

const DEFAULT_NORMALIZE = [
    ["claude'?s\\s+co[-\\s]?work(ing)?", "Claude Cowork"],
    ["claude'?s\\s+code", "Claude Code"],
    ["claude'?s\\s+chat", "Claude Chat"],
    ["claude'?s\\s+desktop", "Claude Desktop"],
    ["claude'?s\\s+master\\s*class", "Claude Masterclass"],
    ["chat\\s*gpt", "ChatGPT"],
    ["google\\s+ad\\s*words", "Google Ads"],
    ["you\\s*tube", "YouTube"],
    ["java\\s*script", "JavaScript"],
    ["type\\s*script", "TypeScript"],
    ["power\\s*point", "PowerPoint"],
    ["word\\s*press", "WordPress"],
    ["v\\s*o\\s*2\\s*max", "VO2 max"],
    ["a\\s*/\\s*b\\s+test(ing)?", "A/B testing"],
    ["six\\s*sigma", "Six Sigma"],
    ["e[-\\s]?commerce", "e-commerce"],
    // Possessive and digit spellings, so the glossary key below still matches
    ["prisoner[\u2019']?s\\s+dilemma", "prisoner's dilemma"],
    ["porter[\u2019']?s\\s+five\\s+forces", "Porter's five forces"],
    ["bloom[\u2019']?s\\s+taxonomy", "Bloom's taxonomy"],
    ["bayes[\u2019']?(?:s)?\\s+(theorem|rule)", "Bayes' $1"],
    ["scope\\s+(?:1|one)\\s+emissions?", "scope 1 emissions"],
    ["scope\\s+(?:2|two)\\s+emissions?", "scope 2 emissions"],
    ["scope\\s+(?:3|three)\\s+emissions?", "scope 3 emissions"]
];

// Ten rieng trung tu tieng Anh thong dung.
// Chi bao ve khi nam GIUA cau, bo qua khi dung dau cau.
const RISKY_PROPER = [
    // Ten san pham trung tu tieng Anh thong dung.
    // Chi bao ve khi nam GIUA cau, bo qua khi dung dau cau.
    "Notion", "Slack", "Excel", "Flask", "Llama", "Swift", "Git",
    "Sora", "Bubble", "Framer", "Branch", "Adjust", "Discover",
    "Prime", "Square", "Stripe", "Lever", "Anchor", "Mint",
    // Bo sung sau khi ra soat: deu la ten san pham nhung trung tu thuong
    "Whisper",    // thi tham
    "Rust",       // gi set
    "Polygon",    // hinh da giac
    "Selenium",   // nguyen to selen
    "Asana",      // tu the yoga
    "Amplitude",  // bien do
    "Airflow",    // luong khong khi
    "Postman",    // nguoi dua thu
    "Swagger",    // dang di venh vao
    "Bootstrap",  // dong tu tu luc
    "Replicate",  // dong tu sao chep
    "Snowflake",  // bong tuyet
    "Perplexity", // su boi roi
    "Cursor",     // con tro chuot
    "Windsurf",   // luot van buom
    "Grok",       // dong tu hieu thau
    "Anaconda",   // con tran
    "Streamlit"   // dong tu tinh gon
];


// ============================================================
// THUAT NGU PHU THUOC NGU CANH
// Chi duoc bao ve khi doan van co dau hieu cua linh vuc do.
// Vi du "agent" trong bai giang AI la AI agent, con trong bai giang
// bao hiem lai la dai ly that va phai de may dich xu ly binh thuong.
// ============================================================
const CONTEXTUAL_TERMS = [
    { term: "agent",       context: ["AI", "LLM", "agentic", "autonomous", "Claude", "GPT", "orchestrat", "tool use", "workflow", "model"] },
    { term: "prompt",      context: ["AI", "LLM", "model", "GPT", "Claude", "token", "engineering", "chatbot"] },
    { term: "token",       context: ["AI", "LLM", "model", "context window", "prompt", "blockchain", "crypto", "wallet", "smart contract"] },
    { term: "embedding",   context: ["AI", "vector", "model", "semantic", "similarity"] },
    { term: "inference",   context: ["AI", "LLM", "model", "GPU", "latency", "deploy"] },
    { term: "hallucination", context: ["AI", "LLM", "model", "GPT", "Claude", "accuracy"] },
    { term: "alignment",   context: ["AI", "LLM", "model", "safety", "RLHF", "human feedback"] },
    { term: "grounding",   context: ["AI", "LLM", "model", "retrieval", "source"] },
    { term: "fine-tune",   context: ["AI", "LLM", "model", "dataset", "training"] },
    { term: "checkpoint",  context: ["AI", "model", "training", "weights"] },
    { term: "impression",  context: ["ad", "campaign", "CTR", "reach", "CPM", "advertis"] },
    { term: "conversion",  context: ["ad", "campaign", "funnel", "landing page", "CTR", "CPA", "marketing"] },
    { term: "funnel",      context: ["marketing", "sales", "conversion", "lead", "campaign"] },
    { term: "churn",       context: ["customer", "subscription", "retention", "SaaS", "revenue"] },
    { term: "wallet",      context: ["crypto", "blockchain", "token", "Bitcoin", "Ethereum", "DeFi"] },
    { term: "mining",      context: ["crypto", "blockchain", "Bitcoin", "hash", "proof of work"] },
    { term: "staking",     context: ["crypto", "blockchain", "token", "yield", "validator"] }
];

const GLOSSARY_GROUPS = {

    tech: {
        label: "Công nghệ và AI",
        terms: [
            // San pham va nen tang
            "Claude Cowork", "Claude Code", "Claude Chat", "Claude Desktop",
            "Claude Masterclass", "Claude Opus", "Claude Sonnet", "Claude Haiku",
            "Claude", "Anthropic", "OpenAI", "ChatGPT", "Gemini", "DeepMind",
            "Llama", "Mistral", "Copilot", "GitHub Copilot", "Midjourney",
            "Stable Diffusion", "DALL-E", "Whisper", "Perplexity", "Hugging Face",
            "LangChain", "LlamaIndex", "Pinecone", "Ollama", "Groq", "Replicate",
            "NVIDIA", "TensorFlow", "PyTorch", "Keras", "scikit-learn",
            "Jupyter Notebook", "Google Colab", "Visual Studio Code",
            "Docker", "Kubernetes", "Terraform", "Ansible", "Jenkins",
            "Amazon Web Services", "Microsoft Azure", "Google Cloud",
            "Cloudflare", "Vercel", "Netlify", "Nginx", "Firebase", "Supabase",
            "MongoDB", "PostgreSQL", "MySQL", "Redis", "Elasticsearch",
            "Kafka", "Apache Spark", "Hadoop", "Airflow", "Snowflake",
            "BigQuery", "Databricks", "GraphQL", "Postman", "Swagger",
            "Node.js", "React.js", "Vue.js", "Django", "Flask", "FastAPI",
            "Next.js", "Tailwind CSS", "Bootstrap", "jQuery",
            "Git", "GitHub", "GitLab", "Bitbucket",
            "Linux", "Ubuntu", "macOS", "Android", "iOS",
            "Python", "JavaScript", "TypeScript", "Kotlin", "Swift", "Rust",
            "Coursera", "Udemy", "edX", "Khan Academy", "YouTube", "LinkedIn",
            "Notion", "Slack", "Figma", "Canva", "Zapier", "Airtable",
            "Trello", "Asana", "Jira", "Google Workspace", "Webflow", "Retool",
            "Microsoft Excel", "Excel", "PowerPoint", "Power BI", "Tableau",
            "Looker Studio", "Shopify", "WordPress", "WooCommerce",
            "Playwright", "Selenium", "Stripe", "Twilio",
            "DeepSeek", "Qwen", "Grok", "xAI", "Cursor", "Windsurf",
            "NotebookLM", "Google AI Studio", "Vertex AI", "Amazon Bedrock",
            "Claude Agent SDK", "LangGraph", "CrewAI", "AutoGen", "n8n",
            "Streamlit", "Gradio", "NumPy", "Matplotlib", "Anaconda",
            "Power Automate", "vLLM", "llama.cpp", "Hugging Face Hub",

            // Viet tat
            "AI", "AGI", "API", "LLM", "MCP", "RAG", "NLP", "CNN", "RNN",
            "GAN", "GPT", "BERT", "GPU", "CPU", "TPU", "RAM", "SSD",
            "HTTP", "HTTPS", "URL", "HTML", "CSS", "SQL", "JSON", "CSV",
            "XML", "YAML", "REST", "SDK", "IDE", "CLI", "GUI", "UI", "UX",
            "SaaS", "PaaS", "IaaS", "VPN", "DNS", "CDN", "SSL", "TLS",
            "SSH", "FTP", "TCP", "DDoS", "MFA", "RBAC", "SRE", "TDD",
            "OOP", "CRUD", "ORM", "DOM", "CORS", "SPA", "PWA", "JWT",
            "OAuth", "IoT", "AR", "VR", "XR", "OCR", "TTS", "ASR", "ETL",
            "CI/CD", "CMS", "CRM", "ERP", "MVP", "QA", "SSO", "MLOps",
            "RLHF", "SFT", "DPO", "CoT", "MoE", "VRAM", "NPU", "CUDA",
            "FLOPS", "ONNX", "WASM", "gRPC", "SQLite", "NoSQL", "SLO", "SLI",
            "LAN", "WAN", "FPGA", "ASIC", "SoC", "LTS", "A2A", "API key",
            "IP address",

            // Cum tu AI
            "machine learning", "deep learning", "neural network",
            "reinforcement learning", "supervised learning",
            "unsupervised learning", "transfer learning",
            "natural language processing", "computer vision",
            "generative ai", "agentic ai", "prompt engineering",
            "large language model", "foundation model", "context window",
            "fine-tuning", "few-shot learning", "zero-shot learning",
            "chain of thought", "vector database", "vector embedding",
            "semantic search", "system prompt", "token limit",
            "multimodal model", "diffusion model", "transformer architecture",
            "attention mechanism", "self-attention", "backpropagation",
            "gradient descent", "loss function", "activation function",
            "batch size", "learning rate", "hyperparameter", "model drift",
            "inference time", "synthetic data", "human in the loop",
            "reinforcement learning from human feedback",
            "guardrails", "temperature setting",

            // Cum tu ky thuat phan mem
            "rate limiting", "load balancing", "microservices",
            "serverless architecture", "container orchestration",
            "continuous integration", "continuous deployment",
            "infrastructure as code", "software development life cycle",
            "refactoring", "regression test", "smoke test",
            "staging environment", "production environment",
            "root cause analysis", "system design", "data structure",
            "time complexity", "space complexity", "garbage collection",
            "race condition", "memory leak", "dependency injection",
            "middleware", "endpoint", "payload", "webhook",
            // Tac nhan AI va quy trinh nhieu tac nhan
            "AI agent", "AI assistant", "autonomous agent", "coding agent",
            "browser agent", "research agent", "agent framework",
            "agent workflow", "agent loop", "agent memory", "agent system",
            "subagent", "agent handoff", "planner executor",
            "multi agent workflow", "agentic workflow", "agentic coding",
            "tool use", "tool calling", "tool schema", "computer use",
            "model context protocol", "MCP server", "MCP client",

            // Lam viec voi mo hinh ngon ngu
            "system message", "user message", "assistant message",
            "prompt template", "prompt injection", "prompt caching",
            "structured output", "JSON mode", "stop sequence",
            "max tokens", "top-k", "top-p", "nucleus sampling",
            "beam search", "greedy decoding", "streaming response",
            "batch inference", "context length", "KV cache",
            "attention head", "tokenizer", "positional encoding",
            "mixture of experts", "vision language model",
            "tree of thought", "self-consistency", "self-critique",
            "reflection pattern", "constitutional AI", "red teaming",
            "jailbreak", "groundedness", "faithfulness",
            "semantic chunking", "reranking", "cosine similarity",
            "similarity search", "vector store", "knowledge graph",
            "LoRA", "PEFT", "quantization", "distillation",
            "model card", "eval harness", "benchmark suite",
            "latent space", "autoencoder", "encoder decoder",
            "sequence to sequence", "speech to text", "text to speech",

            "data pipeline", "pull request", "technical debt",
            "feature flag", "canary release", "blue green deployment",
            "observability", "distributed tracing", "service mesh",
            "event driven architecture", "message queue", "idempotency",
            "graceful degradation", "circuit breaker", "cache invalidation",
            "horizontal scaling", "vertical scaling", "sharding",
            "replication lag", "eventual consistency", "acid transaction",
            "function calling",
            "retrieval augmented generation", "context engineering",
            "agent orchestration", "multi agent system", "chain of agents",
            "cloud computing", "edge computing", "tech stack",
            "front-end", "back-end", "full-stack",
            "user interface", "user experience", "responsive design",
            "single sign-on", "two-factor authentication"
        ]
    },

    marketing: {
        label: "Marketing và quảng cáo",
        terms: [
            // Nen tang va tinh nang
            "Google Ads", "Google Analytics", "Google Tag Manager",
            "Google Search Console", "Google Merchant Center",
            "Google Shopping", "Google Business Profile", "YouTube Ads",
            "Facebook Ads", "Meta Ads", "Meta Business Suite",
            "TikTok Ads", "TikTok Shop", "LinkedIn Ads", "Microsoft Ads",
            "Amazon Ads", "Pinterest Ads", "Google Ads Editor",
            "Performance Max", "Demand Gen", "Display Network",
            "Search Network", "Smart Bidding", "Target CPA", "Target ROAS",
            "Quality Score", "Ad Rank", "Google Sites", "Hotjar",
            "Mailchimp", "HubSpot", "Salesforce", "Klaviyo", "Semrush",
            "Ahrefs", "Mixpanel", "Amplitude", "Optimizely", "AppsFlyer",
            "Taboola", "Outbrain", "Criteo", "Shopee", "Lazada", "Zalo OA",

            // Viet tat
            "CTR", "CPC", "CPA", "CPM", "CPL", "CPV", "CPI", "eCPM",
            "ROAS", "ROI", "KPI", "CTA", "USP", "UGC", "SERP", "PPC",
            "DSP", "SSP", "RTB", "CAC", "LTV", "CLV", "MRR", "ARR",
            "GA4", "GTM", "UTM", "AOV", "ARPU", "GMV", "RFM", "SOV",
            "TOFU", "MOFU", "BOFU", "MQL", "OOH", "DOOH", "CTV", "OTT",
            "B2B", "B2C", "D2C", "OKR", "AIDA", "STP", "SWOT", "PESTEL",
            "NPS", "CSAT", "CRO", "SEO", "SEM", "SMM", "EDM", "KOL", "KOC",

            // Do luong va toi uu
            "landing page", "landing page optimization", "conversion rate",
            "click-through rate", "cost per click", "cost per acquisition",
            "cost per mille", "return on ad spend", "bounce rate",
            "exit rate", "average order value", "cart abandonment",
            "checkout flow", "conversion window", "conversion tracking",
            "view-through conversion", "assisted conversion",
            "attribution model", "last-click attribution",
            "first-click attribution", "multi-touch attribution",
            "data-driven attribution", "incrementality testing",
            "media mix modeling", "cohort analysis", "retention rate",
            "repeat purchase rate", "heat map", "session recording",
            "scroll depth", "exit intent", "core web vitals", "page speed",

            // Chay quang cao
            "bid strategy", "bid adjustment", "daily budget",
            "lifetime budget", "frequency cap", "ad fatigue",
            "creative testing", "dynamic creative", "audience overlap",
            "seed audience", "interest targeting", "behavioral targeting",
            "geotargeting", "dayparting", "device targeting",
            "impression share", "ad group", "search term",
            "keyword research", "long-tail keyword", "negative keyword",
            "match type", "broad match", "phrase match", "exact match",
            "remarketing", "retargeting", "lookalike audience",
            "custom audience", "product listing ad", "shopping campaign",
            "media buying", "ad creative", "ad copy", "banner ad",
            "native ad", "display ad", "video ad", "carousel ad",
            "programmatic advertising", "demand-side platform",
            "supply-side platform", "real-time bidding", "brand safety",
            "viewability", "ad fraud", "click fraud", "bot traffic",

            // Chien luoc va noi dung
            "marketing funnel", "sales funnel", "conversion funnel",
            "top of funnel", "bottom of funnel", "lead generation",
            "lead magnet", "lead nurturing", "lead scoring",
            "call to action", "a/b testing", "split testing",
            "multivariate testing", "growth hacking",
            "content marketing", "email marketing", "affiliate marketing",
            "influencer marketing", "performance marketing",
            "inbound marketing", "outbound marketing", "viral marketing",
            "account based marketing", "marketing automation",
            "drip campaign", "nurture sequence", "welcome email",
            "abandoned cart email", "push notification", "in-app message",
            "brand awareness", "brand identity", "brand positioning",
            "positioning statement", "tone of voice", "brand guideline",
            "brand lift", "market segmentation", "target audience",
            "buyer persona", "unique selling proposition",
            "value proposition", "product-market fit", "go-to-market",
            "marketing mix", "competitive analysis", "voice of customer",
            "content calendar", "editorial calendar", "evergreen content",
            "pillar content", "topic cluster", "internal linking",
            "search engine optimization", "search engine marketing",
            "technical seo", "on-page seo", "off-page seo", "local seo",
            "schema markup", "featured snippet", "mobile-first indexing",
            "pay per click", "organic traffic", "paid traffic",
            "direct traffic", "referral traffic", "backlink",
            "anchor text", "meta description", "meta title",
            "app store optimization", "deep link", "organic install",
            "word of mouth", "social proof", "user-generated content",
            "customer journey", "customer lifetime value",
            "customer acquisition cost", "monthly recurring revenue",
            "churn rate", "engagement rate", "share of voice",
            "affiliate network", "tracking link", "utm parameter",
            "conversion lag", "attribution window", "smart campaign",
            "responsive search ad", "ad extension", "sitelink extension",
            "callout extension", "structured snippet", "audience signal",
            "customer match", "offline conversion", "enhanced conversion",
            "server side tagging", "first party data", "third party cookie",
            "consent mode", "privacy sandbox", "conversion modeling",
            "creative fatigue", "hook rate", "thumb stop ratio",
            "watch time", "completion rate", "viral coefficient",
            "referral program", "loyalty program", "win back campaign"
        ]
    },

    business: {
        label: "Kinh doanh và tài chính",
        terms: [
            "IPO", "M&A", "EPS", "EBITDA", "EBIT", "NPV", "IRR", "DCF",
            "FCF", "ROE", "ROA", "WACC", "CAGR", "COGS", "SKU", "ETF",
            "OPEX", "CAPEX", "TAM", "SAM", "SOM", "MOIC", "GDP", "FDI",
            "SOP", "PMO", "PMP", "ESG", "CEO", "CFO", "COO", "CTO",
            "CMO", "CIO", "R&D", "MBA", "CFA", "CPA", "P&L",
            "YoY", "MoM", "QoQ",

            "cash flow", "gross margin", "net margin", "operating margin",
            "contribution margin", "operating leverage", "break-even point",
            "economies of scale", "sunk cost", "unit economics",
            "price to earnings ratio", "earnings per share",
            "market capitalization", "mergers and acquisitions",
            "initial public offering", "discounted cash flow",
            "net present value", "internal rate of return",
            "dollar cost averaging", "blue chip", "exchange-traded fund",
            "venture capital", "private equity", "angel investor",
            "seed funding", "due diligence", "term sheet", "cap table",
            "exit strategy", "burn rate", "burn multiple", "runway",
            "convertible note", "vesting schedule", "cliff period",
            "stock option", "equity dilution", "down round", "bridge round",
            "bootstrapping", "rule of 40", "gross merchandise value",
            "take rate", "customer concentration", "moat",
            "flywheel effect", "network effect", "first mover advantage",
            "blue ocean strategy", "Porter's five forces",
            "value based pricing", "cost plus pricing",
            "penetration pricing", "skimming pricing", "freemium model",
            "subscription model", "marketplace model", "franchise model",
            "white label", "private label", "dropshipping", "e-commerce",
            "just in time", "inventory turnover",
            "days sales outstanding", "quick ratio", "current ratio",
            "debt to equity", "leverage ratio", "accrual accounting",
            "fiscal year", "quarterly report", "annual report",
            "audit trail", "internal control", "transfer pricing",
            "gantt chart", "raci matrix", "lean startup",
            "north star metric", "leading indicator", "lagging indicator",
            "balanced scorecard", "business case", "feasibility study",
            "stakeholder mapping", "risk register", "contingency plan",
            "vendor management", "service level agreement", "scope baseline",
            "earned value", "critical chain", "resource leveling",
            "working backwards", "pre mortem", "postmortem review",
            "minimum viable product", "design thinking", "scope creep"
        ]
    },

    economics: {
        label: "Kinh tế học",
        terms: [
            "GNP", "CPI", "PPI", "PMI", "IMF", "WTO", "OPEC",

            "inflation rate", "stagflation", "interest rate",
            "monetary policy", "fiscal policy", "quantitative easing",
            "supply and demand", "elasticity of demand",
            "price elasticity", "marginal cost", "marginal revenue",
            "marginal utility", "consumer surplus", "producer surplus",
            "deadweight loss", "market equilibrium",
            "perfect competition", "monopolistic competition",
            "externality", "moral hazard",
            "adverse selection", "information asymmetry",
            "game theory", "nash equilibrium", "prisoner's dilemma",
            "comparative advantage", "absolute advantage",
            "balance of trade", "exchange rate",
            "purchasing power parity", "business cycle",
            "gross domestic product", "unemployment rate",
            "labor force participation", "opportunity cost"
        ]
    },

    sales: {
        label: "Bán hàng và chăm sóc khách hàng",
        terms: [
            "BANT", "MEDDIC", "SPIN", "SDR", "BDR", "QBR", "ACV", "ASP",

            "cold call", "cold email", "warm lead", "sales pipeline",
            "pipeline coverage", "deal stage", "discovery call",
            "demo call", "objection handling", "closing technique",
            "upselling", "cross-selling", "consultative selling",
            "solution selling", "value selling", "social selling",
            "key account", "sales enablement", "sales playbook",
            "quota attainment", "win rate", "sales velocity",
            "customer success", "renewal rate", "expansion revenue",
            "net revenue retention", "churn prevention",
            "sales qualified lead", "marketing qualified lead",
            "customer satisfaction score", "net promoter score"
        ]
    },

    hrops: {
        label: "Nhân sự và vận hành",
        terms: [
            "HRM", "HRBP", "HRIS", "ATS", "DEI", "PTO", "PIP", "L&D",
            "Six Sigma", "Kaizen",

            "talent acquisition", "employer branding", "job description",
            "applicant tracking system", "behavioral interview",
            "structured interview", "culture fit", "onboarding",
            "offboarding", "performance review", "360 degree feedback",
            "succession planning", "career path", "compensation package",
            "base salary", "variable pay", "equity compensation",
            "employee engagement", "employee retention", "turnover rate",
            "remote work", "hybrid work", "work life balance",
            "psychological safety", "servant leadership",
            "span of control", "org chart", "cross functional team",
            "standard operating procedure", "continuous improvement",
            "lean manufacturing", "capacity planning",
            "demand forecasting", "inventory management",
            "supply chain management", "third party logistics",
            "last mile delivery", "fulfillment center", "cycle time",
            "lead time", "quality control"
        ]
    },

    data: {
        label: "Dữ liệu và thống kê",
        terms: [
            "EDA", "PCA", "SVM", "KNN", "MSE", "RMSE", "MAE",
            "AUC", "ROC", "ANOVA", "OLAP", "OLS",

            "standard deviation", "normal distribution",
            "probability distribution", "confidence interval",
            "hypothesis testing", "null hypothesis", "p-value",
            "statistical significance", "correlation coefficient",
            "linear regression", "logistic regression",
            "decision tree", "random forest", "gradient boosting",
            "k-means clustering", "principal component analysis",
            "cross-validation", "overfitting", "underfitting",
            "feature engineering", "training set", "test set",
            "validation set", "confusion matrix",
            "precision and recall", "roc curve", "time series",
            "data cleaning", "data wrangling",
            "exploratory data analysis", "descriptive statistics",
            "inferential statistics", "sample size",
            "central limit theorem", "monte carlo simulation",
            "pivot table", "data warehouse", "data lake", "big data",
            "data mart", "star schema", "slowly changing dimension",
            "data governance", "data lineage", "data catalog",
            "master data management", "data quality dimension",
            "imputation", "normalization", "standardization",
            "one hot encoding", "label encoding", "class imbalance",
            "bootstrap sampling", "ensemble method", "bias variance tradeoff",
            "data visualization", "outlier detection",
            "regression to the mean", "selection bias",
            "statistical power", "effect size", "degrees of freedom"
        ]
    },

    health: {
        label: "Sức khỏe và thể dục",
        terms: [
            "VO2 max", "BMI", "BMR", "TDEE", "HIIT", "HRV", "DOMS",
            "RPE", "1RM", "LISS", "EPOC", "LDL", "HDL", "BPM", "REM",

            "body mass index", "basal metabolic rate",
            "total daily energy expenditure", "lean body mass",
            "heart rate variability", "macronutrient", "micronutrient",
            "protein synthesis", "muscle hypertrophy",
            "progressive overload", "eccentric contraction",
            "concentric contraction", "isometric contraction",
            "deload week", "high-intensity interval training",
            "delayed onset muscle soreness", "glycogen depletion",
            "lactate threshold", "insulin sensitivity",
            "intermittent fasting", "metabolic syndrome",
            "foam rolling", "core stability", "time under tension",
            "rep range", "training split", "push pull legs",
            "mind muscle connection", "anabolic window",
            "muscle protein synthesis", "caloric maintenance",
            "reverse dieting", "body recomposition",
            "training frequency", "volume landmark", "maintenance volume",
            "minimum effective volume", "maximum recoverable volume",
            "rate of perceived exertion", "autoregulation",
            "periodization", "block periodization", "linear progression",
            "double progression", "accessory movement", "prime mover",
            "antagonist muscle", "posterior chain", "anterior chain",
            "energy system", "creatine monohydrate", "beta alanine",
            "electrolyte balance", "hydration status", "sleep debt"
        ]
    },

    medicine: {
        label: "Y khoa và sinh học",
        terms: [
            "DNA", "RNA", "mRNA", "PCR", "MRI", "ECG", "EEG",
            "WHO", "CDC", "FDA", "IVF", "HIV",

            "randomized controlled trial", "double blind study",
            "placebo effect", "clinical trial", "peer reviewed",
            "meta analysis", "systematic review", "control group",
            "treatment group", "informed consent", "side effect",
            "contraindication", "immune system", "gene expression",
            "stem cell", "evidence based medicine",
            "differential diagnosis", "chronic disease",
            "acute condition", "herd immunity", "incubation period",
            "mortality rate", "morbidity rate", "life expectancy",
            "public health", "gut microbiome", "inflammation marker"
        ]
    },

    crypto: {
        label: "Blockchain và tiền số",
        terms: [
            "Bitcoin", "Ethereum", "Solana", "Binance", "Coinbase",
            "Metamask", "Uniswap", "Chainlink", "Polygon",
            "BTC", "ETH", "DeFi", "NFT", "DAO", "DEX", "CEX",
            "TVL", "APY", "APR", "KYC", "AML", "P2P", "ICO",

            "blockchain", "smart contract", "proof of work",
            "proof of stake", "consensus mechanism", "private key",
            "public key", "cold wallet", "hot wallet", "gas fee",
            "liquidity pool", "yield farming", "staking reward",
            "market maker", "order book", "stablecoin", "tokenomics",
            "whitepaper", "airdrop", "rug pull", "bitcoin halving",
            "hash rate", "layer two", "cross chain", "bridge protocol"
        ]
    },

    psychology: {
        label: "Tâm lý và giáo dục",
        terms: [
            "CBT", "IQ", "EQ", "ADHD", "MBTI", "PTSD", "OCD",
            "GPA", "MOOC", "LMS", "STEM",
            "Dunning-Kruger", "Maslow", "Big Five",

            "cognitive behavioral therapy", "growth mindset",
            "fixed mindset", "spaced repetition", "active recall",
            "deliberate practice", "flow state", "cognitive load",
            "confirmation bias", "cognitive dissonance",
            "anchoring bias", "survivorship bias", "sunk cost fallacy",
            "availability heuristic", "framing effect", "loss aversion",
            "imposter syndrome", "emotional intelligence",
            "self-efficacy", "intrinsic motivation",
            "extrinsic motivation", "socratic method",
            "blended learning", "flipped classroom",
            "formative assessment", "summative assessment",
            "feedback loop", "Bloom's taxonomy",
            "metacognition", "retrieval practice", "interleaved practice"
        ]
    },

    design: {
        label: "Thiết kế và truyền thông",
        terms: [
            "RGB", "CMYK", "HEX", "DPI", "PPI", "SVG", "PNG",
            "JPEG", "GIF", "MP4", "FPS", "HDR",

            "wireframe", "mockup", "design system", "style guide",
            "typography", "visual hierarchy", "usability testing",
            "information architecture", "user flow",
            "customer journey map", "vector graphic", "raster image",
            "color grading", "motion graphics", "rule of thirds",
            "above the fold", "negative space", "kerning",
            "leading and tracking", "serif and sans serif",
            "accessibility standard", "contrast ratio", "design token",
            "atomic design", "responsive breakpoint"
        ]
    },

    academic: {
        label: "Học thuật và nghiên cứu",
        terms: [
            "APA", "MLA", "IEEE", "DOI", "ISBN", "ISSN", "IRB",
            "PhD", "MSc", "BSc",

            "literature review", "research question", "research gap",
            "theoretical framework", "conceptual framework",
            "independent variable", "dependent variable",
            "control variable", "confounding variable",
            "qualitative research", "quantitative research",
            "mixed methods", "primary source", "secondary source",
            "citation style", "in-text citation", "reference list",
            "peer reviewed journal", "impact factor", "h-index",
            "thesis statement", "research proposal", "cohort study",
            "longitudinal study", "cross-sectional study",
            "case control study", "focus group", "likert scale",
            "construct validity", "internal validity",
            "external validity", "grounded theory", "content analysis",
            "thematic analysis", "triangulation", "saturation point",
            "ethical approval", "sampling frame", "random sampling",
            "stratified sampling", "convenience sampling",
            "response rate", "pilot study", "open access"
        ]
    },

    cybersecurity: {
        label: "An ninh mạng",
        terms: [
            "SOC", "SIEM", "IDS", "WAF", "EDR", "XDR", "MITM",
            "APT", "CVE", "CVSS", "OWASP", "PKI", "IAM", "SASE",

            "phishing", "spear phishing", "ransomware", "malware",
            "spyware", "keylogger", "botnet", "zero day", "zero trust",
            "penetration testing", "red team", "blue team",
            "threat modeling", "attack surface", "social engineering",
            "brute force attack", "sql injection",
            "cross site scripting", "man in the middle",
            "denial of service", "security audit", "incident response",
            "vulnerability scan", "patch management",
            "end to end encryption", "hashing algorithm",
            "digital signature", "certificate authority",
            "security token", "threat intelligence", "security posture"
        ]
    },

    sustainability: {
        label: "Môi trường và bền vững",
        terms: [
            "SDG", "GHG", "LCA", "EPR",

            "carbon footprint", "carbon neutral", "net zero",
            "carbon offset", "carbon credit", "circular economy",
            "linear economy", "life cycle assessment", "greenwashing",
            "sustainable development", "waste management",
            "energy efficiency", "supply chain transparency",
            "fair trade", "social impact", "impact investing",
            "triple bottom line", "stakeholder capitalism",
            "science based target", "scope 1 emissions",
            "scope 2 emissions", "scope 3 emissions"
        ]
    },

    realestate: {
        label: "Bất động sản",
        terms: [
            "REIT", "NOI", "HOA",

            "cap rate", "net operating income", "gross rental yield",
            "net rental yield", "cash on cash return", "loan to value",
            "debt service coverage ratio", "amortization schedule",
            "escrow", "title deed", "leasehold", "freehold", "zoning",
            "closing cost", "mortgage rate", "fixed rate mortgage",
            "adjustable rate mortgage", "refinancing", "equity release",
            "property management", "vacancy rate", "tenant turnover",
            "capital appreciation", "mixed use development",
            "gross floor area", "net usable area", "master plan"
        ]
    },

    legal: {
        label: "Pháp lý và chính sách",
        terms: [
            "NDA", "GDPR", "CCPA", "SLA", "LLC", "EULA", "DMCA", "CSR",

            "intellectual property", "fair use", "licensing agreement",
            "non-disclosure agreement", "terms of service",
            "force majeure", "statute of limitations",
            "corporate social responsibility", "compliance program",
            "data processing agreement", "right to be forgotten",
            "cookie consent", "legal liability", "indemnification"
        ]
    },

    math: {
        label: "Toán học và thuật toán",
        terms: [
            "Big O", "Big O notation",
            "stochastic gradient descent", "softmax",
            "sigmoid function", "one-hot vector"
        ]
    },

    productivity: {
        label: "Kỹ năng và năng suất",
        terms: [
            "GTD", "SMART", "Pomodoro",
            "deep work", "time blocking", "second brain", "habit stacking",
            "inbox zero", "weekly review"
        ]
    }
};

// ============================================================
// TERMS WITH A SETTLED VIETNAMESE RENDERING
// Protected like every glossary term, but restored as the Vietnamese on the right instead of the
// English on the left: one fixed rendering per lecture, and no English left in the subtitle or the
// dubbed voice. Keys are lowercase (lookup is case-insensitive, plurals fold to the singular).
// Only phrases whose Vietnamese is standard in textbooks or Vietnamese product UIs belong here;
// a phrase with a common everyday second sense ("public good", "exact match") stays out, because
// the rendering is applied without looking at the sentence. Jargon Vietnamese developers say in
// English ("unit test", "pull request", "overfitting") stays English on purpose.
// ============================================================
const GLOSSARY_VI = {
    tech: {
        "neural network": "mạng nơ-ron",
        "reinforcement learning": "học tăng cường",
        "reinforcement learning from human feedback": "học tăng cường từ phản hồi của con người",
        "supervised learning": "học có giám sát",
        "unsupervised learning": "học không giám sát",
        "transfer learning": "học chuyển giao",
        "natural language processing": "xử lý ngôn ngữ tự nhiên",
        "computer vision": "thị giác máy tính",
        "generative ai": "AI tạo sinh",
        "artificial intelligence": "trí tuệ nhân tạo",
        "large language model": "mô hình ngôn ngữ lớn",
        "foundation model": "mô hình nền tảng",
        "vector database": "cơ sở dữ liệu vector",
        "semantic search": "tìm kiếm ngữ nghĩa",
        "attention mechanism": "cơ chế chú ý",
        "loss function": "hàm mất mát",
        "activation function": "hàm kích hoạt",
        "learning rate": "tốc độ học",
        "synthetic data": "dữ liệu tổng hợp",
        "knowledge graph": "đồ thị tri thức",
        "cosine similarity": "độ tương đồng cosine",
        "latent space": "không gian tiềm ẩn",
        "speech to text": "chuyển giọng nói thành văn bản",
        "text to speech": "chuyển văn bản thành giọng nói",
        "load balancing": "cân bằng tải",
        "root cause analysis": "phân tích nguyên nhân gốc rễ",
        "system design": "thiết kế hệ thống",
        "data structure": "cấu trúc dữ liệu",
        "time complexity": "độ phức tạp thời gian",
        "space complexity": "độ phức tạp không gian",
        "memory leak": "rò rỉ bộ nhớ",
        "technical debt": "nợ kỹ thuật",
        "message queue": "hàng đợi tin nhắn",
        "distributed tracing": "truy vết phân tán",
        "horizontal scaling": "mở rộng theo chiều ngang",
        "vertical scaling": "mở rộng theo chiều dọc",
        "eventual consistency": "nhất quán cuối cùng",
        "cloud computing": "điện toán đám mây",
        "edge computing": "điện toán biên",
        "user interface": "giao diện người dùng",
        "user experience": "trải nghiệm người dùng",
        "two-factor authentication": "xác thực hai yếu tố",
        "source code": "mã nguồn",
        "open source": "mã nguồn mở",
        "operating system": "hệ điều hành",
        "version control": "quản lý phiên bản",
        "object oriented programming": "lập trình hướng đối tượng",
        "functional programming": "lập trình hàm",
        "programming language": "ngôn ngữ lập trình",
        "binary search": "tìm kiếm nhị phân",
        "linked list": "danh sách liên kết",
        "hash table": "bảng băm",
        "binary tree": "cây nhị phân",
        "dynamic programming": "quy hoạch động",
        "sorting algorithm": "thuật toán sắp xếp"
    },

    marketing: {
        // Metrics that Vietnamese marketers say in English (CTR, conversion rate, bounce rate)
        // stay English; these are the ones with an everyday Vietnamese name
        "brand awareness": "nhận biết thương hiệu",
        "brand positioning": "định vị thương hiệu",
        "brand identity": "nhận diện thương hiệu",
        "target audience": "đối tượng mục tiêu",
        "market segmentation": "phân khúc thị trường",
        "competitive analysis": "phân tích đối thủ cạnh tranh",
        "customer journey": "hành trình khách hàng",
        "word of mouth": "truyền miệng",
        "social proof": "bằng chứng xã hội",
        "call to action": "lời kêu gọi hành động",
        "customer lifetime value": "giá trị vòng đời khách hàng",
        "customer acquisition cost": "chi phí thu hút khách hàng",
        "monthly recurring revenue": "doanh thu định kỳ hằng tháng",
        "average order value": "giá trị đơn hàng trung bình",
        "retention rate": "tỷ lệ giữ chân",
        "churn rate": "tỷ lệ rời bỏ",
        "engagement rate": "tỷ lệ tương tác",
        "keyword research": "nghiên cứu từ khóa",
        "negative keyword": "từ khóa phủ định",
        "broad match": "đối sánh rộng",
        "phrase match": "đối sánh cụm từ",
        "bid strategy": "chiến lược giá thầu",
        "bid adjustment": "điều chỉnh giá thầu",
        "daily budget": "ngân sách hằng ngày",
        "ad group": "nhóm quảng cáo",
        "organic traffic": "lưu lượng truy cập tự nhiên",
        "paid traffic": "lưu lượng truy cập trả phí",
        "loyalty program": "chương trình khách hàng thân thiết",
        "referral program": "chương trình giới thiệu",
        "buyer persona": "chân dung khách hàng"
    },

    business: {
        "cash flow": "dòng tiền",
        "gross margin": "biên lợi nhuận gộp",
        "net margin": "biên lợi nhuận ròng",
        "operating margin": "biên lợi nhuận hoạt động",
        "contribution margin": "số dư đảm phí",
        "operating leverage": "đòn bẩy hoạt động",
        "break-even point": "điểm hòa vốn",
        "economies of scale": "lợi thế kinh tế theo quy mô",
        "sunk cost": "chi phí chìm",
        "earnings per share": "lợi nhuận trên mỗi cổ phiếu",
        "market capitalization": "vốn hóa thị trường",
        "mergers and acquisitions": "mua bán và sáp nhập",
        "initial public offering": "phát hành cổ phiếu lần đầu ra công chúng",
        "discounted cash flow": "dòng tiền chiết khấu",
        "net present value": "giá trị hiện tại ròng",
        "internal rate of return": "tỷ suất hoàn vốn nội bộ",
        "venture capital": "vốn đầu tư mạo hiểm",
        "angel investor": "nhà đầu tư thiên thần",
        "seed funding": "vốn hạt giống",
        "exit strategy": "chiến lược thoái vốn",
        "stock option": "quyền chọn cổ phiếu",
        "network effect": "hiệu ứng mạng lưới",
        "first mover advantage": "lợi thế người đi đầu",
        "blue ocean strategy": "chiến lược đại dương xanh",
        "design thinking": "tư duy thiết kế",
        "inventory turnover": "vòng quay hàng tồn kho",
        "quick ratio": "hệ số thanh toán nhanh",
        "current ratio": "hệ số thanh toán hiện hành",
        "debt to equity": "tỷ lệ nợ trên vốn chủ sở hữu",
        "accrual accounting": "kế toán dồn tích",
        "fiscal year": "năm tài chính",
        "quarterly report": "báo cáo quý",
        "annual report": "báo cáo thường niên",
        "internal control": "kiểm soát nội bộ",
        "transfer pricing": "chuyển giá",
        "feasibility study": "nghiên cứu khả thi",
        "contingency plan": "kế hoạch dự phòng",
        "leading indicator": "chỉ báo dẫn dắt",
        "lagging indicator": "chỉ báo trễ",
        "balanced scorecard": "thẻ điểm cân bằng",
        "Porter's five forces": "mô hình năm lực lượng cạnh tranh của Porter"
    },

    economics: {
        "inflation rate": "tỷ lệ lạm phát",
        "stagflation": "lạm phát đình trệ",
        "interest rate": "lãi suất",
        "monetary policy": "chính sách tiền tệ",
        "fiscal policy": "chính sách tài khóa",
        "quantitative easing": "nới lỏng định lượng",
        "supply and demand": "cung và cầu",
        "elasticity of demand": "độ co giãn của cầu",
        "price elasticity": "độ co giãn theo giá",
        "marginal cost": "chi phí cận biên",
        "marginal revenue": "doanh thu cận biên",
        "marginal utility": "độ thỏa dụng cận biên",
        "consumer surplus": "thặng dư tiêu dùng",
        "producer surplus": "thặng dư sản xuất",
        "deadweight loss": "tổn thất vô ích",
        "market equilibrium": "cân bằng thị trường",
        "perfect competition": "cạnh tranh hoàn hảo",
        "monopolistic competition": "cạnh tranh độc quyền",
        "externality": "ngoại ứng",
        "moral hazard": "rủi ro đạo đức",
        "adverse selection": "lựa chọn bất lợi",
        "information asymmetry": "bất cân xứng thông tin",
        "game theory": "lý thuyết trò chơi",
        "nash equilibrium": "cân bằng Nash",
        "prisoner's dilemma": "thế lưỡng nan của người tù",
        "comparative advantage": "lợi thế so sánh",
        "absolute advantage": "lợi thế tuyệt đối",
        "balance of trade": "cán cân thương mại",
        "exchange rate": "tỷ giá hối đoái",
        "purchasing power parity": "ngang giá sức mua",
        "business cycle": "chu kỳ kinh doanh",
        "gross domestic product": "tổng sản phẩm quốc nội",
        "unemployment rate": "tỷ lệ thất nghiệp",
        "labor force participation": "tỷ lệ tham gia lực lượng lao động",
        "opportunity cost": "chi phí cơ hội",
        "central bank": "ngân hàng trung ương",
        "trade deficit": "thâm hụt thương mại",
        "budget deficit": "thâm hụt ngân sách",
        "invisible hand": "bàn tay vô hình",
        "diminishing returns": "lợi suất giảm dần"
    },

    sales: {
        "cold call": "cuộc gọi chào hàng",
        "objection handling": "xử lý từ chối",
        "upselling": "bán thêm gói cao hơn",
        "cross-selling": "bán chéo",
        "consultative selling": "bán hàng tư vấn",
        "win rate": "tỷ lệ chốt đơn",
        "customer success": "thành công của khách hàng",
        "renewal rate": "tỷ lệ gia hạn",
        "customer satisfaction score": "điểm hài lòng của khách hàng"
    },

    hrops: {
        "talent acquisition": "thu hút nhân tài",
        "employer branding": "thương hiệu nhà tuyển dụng",
        "job description": "bản mô tả công việc",
        "behavioral interview": "phỏng vấn hành vi",
        "structured interview": "phỏng vấn có cấu trúc",
        "performance review": "đánh giá hiệu suất",
        "succession planning": "hoạch định kế nhiệm",
        "career path": "lộ trình sự nghiệp",
        "compensation package": "gói đãi ngộ",
        "base salary": "lương cơ bản",
        "employee engagement": "mức độ gắn kết của nhân viên",
        "employee retention": "giữ chân nhân viên",
        "turnover rate": "tỷ lệ nghỉ việc",
        "remote work": "làm việc từ xa",
        "hybrid work": "làm việc kết hợp",
        "work life balance": "cân bằng công việc và cuộc sống",
        "psychological safety": "an toàn tâm lý",
        "servant leadership": "lãnh đạo phục vụ",
        "span of control": "phạm vi kiểm soát",
        "org chart": "sơ đồ tổ chức",
        "cross functional team": "nhóm liên chức năng",
        "standard operating procedure": "quy trình vận hành chuẩn",
        "continuous improvement": "cải tiến liên tục",
        "lean manufacturing": "sản xuất tinh gọn",
        "capacity planning": "hoạch định năng lực",
        "demand forecasting": "dự báo nhu cầu",
        "inventory management": "quản lý hàng tồn kho",
        "supply chain management": "quản lý chuỗi cung ứng",
        "last mile delivery": "giao hàng chặng cuối",
        "fulfillment center": "trung tâm xử lý đơn hàng",
        "quality control": "kiểm soát chất lượng"
    },

    data: {
        "standard deviation": "độ lệch chuẩn",
        "normal distribution": "phân phối chuẩn",
        "probability distribution": "phân phối xác suất",
        "confidence interval": "khoảng tin cậy",
        "hypothesis testing": "kiểm định giả thuyết",
        "null hypothesis": "giả thuyết không",
        "alternative hypothesis": "giả thuyết đối",
        "statistical significance": "ý nghĩa thống kê",
        "correlation coefficient": "hệ số tương quan",
        "linear regression": "hồi quy tuyến tính",
        "logistic regression": "hồi quy logistic",
        "decision tree": "cây quyết định",
        "random forest": "rừng ngẫu nhiên",
        "k-means clustering": "phân cụm k-means",
        "principal component analysis": "phân tích thành phần chính",
        "cross-validation": "kiểm định chéo",
        "training set": "tập huấn luyện",
        "validation set": "tập kiểm định",
        "test set": "tập kiểm tra",
        "confusion matrix": "ma trận nhầm lẫn",
        "time series": "chuỗi thời gian",
        "data cleaning": "làm sạch dữ liệu",
        "exploratory data analysis": "phân tích dữ liệu khám phá",
        "descriptive statistics": "thống kê mô tả",
        "inferential statistics": "thống kê suy luận",
        "sample size": "cỡ mẫu",
        "central limit theorem": "định lý giới hạn trung tâm",
        "monte carlo simulation": "mô phỏng Monte Carlo",
        "data warehouse": "kho dữ liệu",
        "data governance": "quản trị dữ liệu",
        "class imbalance": "mất cân bằng lớp",
        "data visualization": "trực quan hóa dữ liệu",
        "outlier detection": "phát hiện giá trị ngoại lai",
        "regression to the mean": "hồi quy về giá trị trung bình",
        "selection bias": "sai lệch chọn mẫu",
        "statistical power": "lực kiểm định",
        "effect size": "cỡ hiệu ứng",
        "degrees of freedom": "bậc tự do",
        "margin of error": "biên sai số",
        "sampling error": "sai số chọn mẫu",
        "type i error": "sai lầm loại I",
        "type ii error": "sai lầm loại II"
    },

    health: {
        "body mass index": "chỉ số khối cơ thể",
        "basal metabolic rate": "tỷ lệ trao đổi chất cơ bản",
        "total daily energy expenditure": "tổng năng lượng tiêu hao mỗi ngày",
        "lean body mass": "khối lượng cơ thể nạc",
        "heart rate variability": "biến thiên nhịp tim",
        "resting heart rate": "nhịp tim lúc nghỉ",
        "macronutrient": "chất dinh dưỡng đa lượng",
        "micronutrient": "vi chất dinh dưỡng",
        "protein synthesis": "tổng hợp protein",
        "muscle protein synthesis": "tổng hợp protein cơ",
        "muscle hypertrophy": "phì đại cơ",
        "progressive overload": "tăng tải lũy tiến",
        "eccentric contraction": "co cơ lệch tâm",
        "concentric contraction": "co cơ đồng tâm",
        "isometric contraction": "co cơ đẳng trường",
        "delayed onset muscle soreness": "đau cơ khởi phát muộn",
        "glycogen depletion": "cạn kiệt glycogen",
        "lactate threshold": "ngưỡng lactate",
        "insulin sensitivity": "độ nhạy insulin",
        "intermittent fasting": "nhịn ăn gián đoạn",
        "metabolic syndrome": "hội chứng chuyển hóa",
        "rate of perceived exertion": "mức gắng sức cảm nhận",
        "antagonist muscle": "cơ đối vận",
        "posterior chain": "chuỗi cơ sau",
        "anterior chain": "chuỗi cơ trước",
        "energy system": "hệ năng lượng",
        "electrolyte balance": "cân bằng điện giải",
        "sleep debt": "nợ ngủ",
        "range of motion": "biên độ chuyển động",
        "compound exercise": "bài tập đa khớp",
        "isolation exercise": "bài tập đơn khớp",
        "calorie deficit": "thâm hụt calo",
        "calorie surplus": "dư thừa calo",
        "circadian rhythm": "nhịp sinh học",
        "sleep hygiene": "vệ sinh giấc ngủ"
    },

    medicine: {
        "randomized controlled trial": "thử nghiệm ngẫu nhiên có đối chứng",
        "double blind study": "nghiên cứu mù đôi",
        "placebo effect": "hiệu ứng giả dược",
        "clinical trial": "thử nghiệm lâm sàng",
        "meta analysis": "phân tích gộp",
        "systematic review": "tổng quan hệ thống",
        "control group": "nhóm đối chứng",
        "treatment group": "nhóm can thiệp",
        "side effect": "tác dụng phụ",
        "contraindication": "chống chỉ định",
        "immune system": "hệ miễn dịch",
        "gene expression": "biểu hiện gen",
        "stem cell": "tế bào gốc",
        "evidence based medicine": "y học dựa trên bằng chứng",
        "differential diagnosis": "chẩn đoán phân biệt",
        "chronic disease": "bệnh mạn tính",
        "herd immunity": "miễn dịch cộng đồng",
        "incubation period": "thời kỳ ủ bệnh",
        "mortality rate": "tỷ lệ tử vong",
        "life expectancy": "tuổi thọ trung bình",
        "public health": "y tế công cộng",
        "gut microbiome": "hệ vi sinh vật đường ruột",
        "blood pressure": "huyết áp",
        "blood sugar": "đường huyết",
        "cardiovascular disease": "bệnh tim mạch",
        "type 2 diabetes": "tiểu đường tuýp 2",
        "risk factor": "yếu tố nguy cơ",
        "adverse event": "biến cố bất lợi",
        "antibiotic resistance": "kháng kháng sinh",
        "vital signs": "dấu hiệu sinh tồn"
    },

    crypto: {
        "smart contract": "hợp đồng thông minh",
        "proof of work": "bằng chứng công việc",
        "proof of stake": "bằng chứng cổ phần",
        "consensus mechanism": "cơ chế đồng thuận",
        "private key": "khóa riêng tư",
        "public key": "khóa công khai",
        "cold wallet": "ví lạnh",
        "hot wallet": "ví nóng",
        "gas fee": "phí gas",
        "liquidity pool": "bể thanh khoản",
        "order book": "sổ lệnh"
    },

    psychology: {
        "cognitive behavioral therapy": "liệu pháp nhận thức hành vi",
        "growth mindset": "tư duy phát triển",
        "fixed mindset": "tư duy cố định",
        "spaced repetition": "lặp lại ngắt quãng",
        "active recall": "chủ động gợi nhớ",
        "deliberate practice": "luyện tập có chủ đích",
        "flow state": "trạng thái dòng chảy",
        "cognitive load": "tải nhận thức",
        "confirmation bias": "thiên kiến xác nhận",
        "cognitive dissonance": "bất hòa nhận thức",
        "anchoring bias": "thiên kiến mỏ neo",
        "survivorship bias": "thiên kiến kẻ sống sót",
        "sunk cost fallacy": "ngụy biện chi phí chìm",
        "availability heuristic": "suy nghiệm sẵn có",
        "framing effect": "hiệu ứng đóng khung",
        "loss aversion": "tâm lý ngại mất mát",
        "imposter syndrome": "hội chứng kẻ mạo danh",
        "emotional intelligence": "trí tuệ cảm xúc",
        "intrinsic motivation": "động lực nội tại",
        "extrinsic motivation": "động lực bên ngoài",
        "socratic method": "phương pháp Socrates",
        "blended learning": "học tập kết hợp",
        "flipped classroom": "lớp học đảo ngược",
        "formative assessment": "đánh giá quá trình",
        "summative assessment": "đánh giá tổng kết",
        "feedback loop": "vòng phản hồi",
        "Bloom's taxonomy": "thang phân loại Bloom",
        "metacognition": "siêu nhận thức",
        "retrieval practice": "luyện tập truy xuất",
        "interleaved practice": "luyện tập xen kẽ",
        "working memory": "trí nhớ làm việc",
        "long-term memory": "trí nhớ dài hạn",
        "short-term memory": "trí nhớ ngắn hạn",
        "learned helplessness": "bất lực tập nhiễm",
        "negativity bias": "thiên kiến tiêu cực"
    },

    design: {
        "visual hierarchy": "phân cấp thị giác",
        "usability testing": "kiểm thử khả năng sử dụng",
        "information architecture": "kiến trúc thông tin",
        "customer journey map": "bản đồ hành trình khách hàng",
        "vector graphic": "đồ họa vector",
        "color grading": "chỉnh màu",
        "rule of thirds": "quy tắc một phần ba",
        "negative space": "khoảng trống",
        "contrast ratio": "tỷ lệ tương phản",
        "color theory": "lý thuyết màu sắc",
        "complementary color": "màu bổ túc",
        "aspect ratio": "tỷ lệ khung hình",
        "focal point": "điểm nhấn"
    },

    academic: {
        "literature review": "tổng quan tài liệu",
        "research question": "câu hỏi nghiên cứu",
        "research gap": "khoảng trống nghiên cứu",
        "theoretical framework": "khung lý thuyết",
        "conceptual framework": "khung khái niệm",
        "independent variable": "biến độc lập",
        "dependent variable": "biến phụ thuộc",
        "control variable": "biến kiểm soát",
        "confounding variable": "biến gây nhiễu",
        "qualitative research": "nghiên cứu định tính",
        "quantitative research": "nghiên cứu định lượng",
        "mixed methods": "phương pháp hỗn hợp",
        "primary source": "nguồn sơ cấp",
        "secondary source": "nguồn thứ cấp",
        "reference list": "danh mục tài liệu tham khảo",
        "peer reviewed journal": "tạp chí có bình duyệt",
        "impact factor": "chỉ số ảnh hưởng",
        "thesis statement": "luận điểm chính",
        "research proposal": "đề cương nghiên cứu",
        "cohort study": "nghiên cứu đoàn hệ",
        "longitudinal study": "nghiên cứu dọc",
        "cross-sectional study": "nghiên cứu cắt ngang",
        "case control study": "nghiên cứu bệnh chứng",
        "focus group": "nhóm tập trung",
        "likert scale": "thang đo Likert",
        "internal validity": "giá trị nội tại",
        "external validity": "giá trị ngoại tại",
        "grounded theory": "lý thuyết nền",
        "content analysis": "phân tích nội dung",
        "thematic analysis": "phân tích chủ đề",
        "ethical approval": "phê duyệt đạo đức",
        "sampling frame": "khung chọn mẫu",
        "random sampling": "chọn mẫu ngẫu nhiên",
        "stratified sampling": "chọn mẫu phân tầng",
        "convenience sampling": "chọn mẫu thuận tiện",
        "response rate": "tỷ lệ phản hồi",
        "pilot study": "nghiên cứu thử nghiệm",
        "open access": "truy cập mở"
    },

    cybersecurity: {
        "penetration testing": "kiểm thử xâm nhập",
        "threat modeling": "mô hình hóa mối đe dọa",
        "attack surface": "bề mặt tấn công",
        "brute force attack": "tấn công vét cạn",
        "man in the middle": "tấn công xen giữa",
        "denial of service": "từ chối dịch vụ",
        "incident response": "ứng phó sự cố",
        "vulnerability scan": "quét lỗ hổng",
        "patch management": "quản lý bản vá",
        "end to end encryption": "mã hóa đầu cuối",
        "hashing algorithm": "thuật toán băm",
        "digital signature": "chữ ký số",
        "certificate authority": "tổ chức cấp chứng thư số",
        "threat intelligence": "thông tin tình báo về mối đe dọa",
        "access control": "kiểm soát truy cập",
        "least privilege": "đặc quyền tối thiểu",
        "data breach": "rò rỉ dữ liệu",
        "password manager": "trình quản lý mật khẩu"
    },

    sustainability: {
        "carbon footprint": "dấu chân carbon",
        "carbon neutral": "trung hòa carbon",
        "net zero": "phát thải ròng bằng 0",
        "carbon offset": "bù đắp carbon",
        "carbon credit": "tín chỉ carbon",
        "circular economy": "kinh tế tuần hoàn",
        "linear economy": "kinh tế tuyến tính",
        "life cycle assessment": "đánh giá vòng đời",
        "greenwashing": "tẩy xanh",
        "sustainable development": "phát triển bền vững",
        "waste management": "quản lý chất thải",
        "energy efficiency": "hiệu quả năng lượng",
        "fair trade": "thương mại công bằng",
        "impact investing": "đầu tư tác động",
        "scope 1 emissions": "phát thải phạm vi 1",
        "scope 2 emissions": "phát thải phạm vi 2",
        "scope 3 emissions": "phát thải phạm vi 3",
        "renewable energy": "năng lượng tái tạo",
        "climate change": "biến đổi khí hậu",
        "greenhouse gas": "khí nhà kính",
        "fossil fuel": "nhiên liệu hóa thạch"
    },

    realestate: {
        "cap rate": "tỷ suất vốn hóa",
        "net operating income": "thu nhập hoạt động ròng",
        "gross rental yield": "tỷ suất cho thuê gộp",
        "net rental yield": "tỷ suất cho thuê ròng",
        "loan to value": "tỷ lệ cho vay trên giá trị tài sản",
        "debt service coverage ratio": "hệ số khả năng trả nợ",
        "amortization schedule": "lịch trả nợ",
        "leasehold": "sở hữu có thời hạn",
        "freehold": "sở hữu vĩnh viễn",
        "closing cost": "chi phí hoàn tất giao dịch",
        "mortgage rate": "lãi suất vay thế chấp",
        "fixed rate mortgage": "khoản vay thế chấp lãi suất cố định",
        "adjustable rate mortgage": "khoản vay thế chấp lãi suất thả nổi",
        "property management": "quản lý bất động sản",
        "vacancy rate": "tỷ lệ trống",
        "capital appreciation": "tăng giá vốn",
        "mixed use development": "dự án đa chức năng",
        "gross floor area": "tổng diện tích sàn"
    },

    legal: {
        "intellectual property": "sở hữu trí tuệ",
        "fair use": "sử dụng hợp lý",
        "licensing agreement": "hợp đồng cấp phép",
        "non-disclosure agreement": "thỏa thuận bảo mật",
        "terms of service": "điều khoản dịch vụ",
        "force majeure": "bất khả kháng",
        "statute of limitations": "thời hiệu khởi kiện",
        "corporate social responsibility": "trách nhiệm xã hội của doanh nghiệp",
        "compliance program": "chương trình tuân thủ",
        "data processing agreement": "thỏa thuận xử lý dữ liệu",
        "right to be forgotten": "quyền được lãng quên",
        "legal liability": "trách nhiệm pháp lý",
        "indemnification": "bồi hoàn",
        "burden of proof": "nghĩa vụ chứng minh",
        "due process": "thủ tục tố tụng hợp pháp",
        "privacy policy": "chính sách quyền riêng tư"
    },

    math: {
        "linear algebra": "đại số tuyến tính",
        "matrix multiplication": "phép nhân ma trận",
        "identity matrix": "ma trận đơn vị",
        "inverse matrix": "ma trận nghịch đảo",
        "dot product": "tích vô hướng",
        "cross product": "tích có hướng",
        "eigenvalue": "trị riêng",
        "eigenvector": "vector riêng",
        "vector space": "không gian vector",
        "linear combination": "tổ hợp tuyến tính",
        "partial derivative": "đạo hàm riêng",
        "chain rule": "quy tắc dây chuyền",
        "differential equation": "phương trình vi phân",
        "definite integral": "tích phân xác định",
        "indefinite integral": "tích phân bất định",
        "prime number": "số nguyên tố",
        "real number": "số thực",
        "complex number": "số phức",
        "natural number": "số tự nhiên",
        "probability density function": "hàm mật độ xác suất",
        "expected value": "giá trị kỳ vọng",
        "conditional probability": "xác suất có điều kiện",
        "Bayes' theorem": "định lý Bayes",
        "Bayes' rule": "quy tắc Bayes",
        "pythagorean theorem": "định lý Pythagore",
        "law of large numbers": "luật số lớn",
        "random variable": "biến ngẫu nhiên",
        "cost function": "hàm chi phí",
        "local minimum": "cực tiểu địa phương",
        "global minimum": "cực tiểu toàn cục",
        "convex function": "hàm lồi"
    },

    productivity: {
        "time management": "quản lý thời gian",
        "critical thinking": "tư duy phản biện",
        "active listening": "lắng nghe chủ động",
        "public speaking": "nói trước công chúng",
        "first principles thinking": "tư duy từ nguyên lý gốc",
        "mental model": "mô hình tư duy",
        "decision fatigue": "mệt mỏi khi ra quyết định",
        "comfort zone": "vùng an toàn",
        "eisenhower matrix": "ma trận Eisenhower",
        "pomodoro technique": "kỹ thuật Pomodoro",
        "SMART goal": "mục tiêu SMART",
        "to-do list": "danh sách việc cần làm"
    }
};

// Every rendered key is a protected term of its group, so the options page counts it and the
// content script builds it into the match patterns with no second list to keep in step
for (const [key, map] of Object.entries(GLOSSARY_VI)) {
    const group = GLOSSARY_GROUPS[key];
    if (!group) continue;
    group.vi = {};
    const have = new Set(group.terms.map(t => t.toLowerCase()));
    for (const [en, vi] of Object.entries(map)) {
        group.vi[en.toLowerCase()] = vi;
        if (!have.has(en.toLowerCase())) { group.terms.push(en); have.add(en.toLowerCase()); }
    }
}

// Group keys that existed before settings remembered which groups the user had seen (1.8.5).
// A stored enabledGroups list predates any group not named here, so such a group starts on
// instead of silently off for everyone who ever pressed Save.
const LEGACY_GROUP_KEYS = [
    "tech", "marketing", "business", "economics", "sales", "hrops", "data", "health", "medicine",
    "crypto", "psychology", "design", "academic", "cybersecurity", "sustainability", "realestate", "legal"
];

// saved: { enabledGroups, knownGroups } as read from storage (either may be missing)
function resolveEnabledGroups(saved) {
    const all = Object.keys(GLOSSARY_GROUPS);
    const s = saved || {};
    if (!Array.isArray(s.enabledGroups)) return all;
    const known = new Set(Array.isArray(s.knownGroups) ? s.knownGroups : LEGACY_GROUP_KEYS);
    return all.filter(k => s.enabledGroups.includes(k) || !known.has(k));
}

const DEFAULT_ENABLED_GROUPS = Object.keys(GLOSSARY_GROUPS);

// Same three-way export as the other modules: page (window), service worker (globalThis), Node tests
const CST_GLOSSARY_API = {
    CST_GLOSSARY_GROUPS: GLOSSARY_GROUPS,
    CST_DEFAULT_NORMALIZE: DEFAULT_NORMALIZE,
    CST_DEFAULT_ENABLED_GROUPS: DEFAULT_ENABLED_GROUPS,
    CST_RISKY_PROPER: RISKY_PROPER,
    CST_CONTEXTUAL_TERMS: CONTEXTUAL_TERMS,
    CST_GLOSSARY_VI: GLOSSARY_VI,
    CST_resolveEnabledGroups: resolveEnabledGroups
};
if (typeof globalThis !== "undefined") Object.assign(globalThis, CST_GLOSSARY_API);
if (typeof window !== "undefined" && window !== globalThis) Object.assign(window, CST_GLOSSARY_API);
if (typeof module === "object" && module.exports) module.exports = CST_GLOSSARY_API;
