const OpenAI = require("openai")
const puppeteerService = require("./puppeteer.service")
const pdfParse = require("pdf-parse")
const { z } = require("zod")
const { zodResponseFormat } = require("openai/helpers/zod")
const redis = require("../config/redis.config")
const crypto = require("crypto")

const openai = new OpenAI({
    apiKey: process.env.OPEN_API_KEY
})

// ─── Interview Report ─────────────────────────────────────────────────────────

const StrategicQuestionSchema = z.object({
  id: z.string(),
  question: z.string(),
  referencedBullet: z.string(),
  interviewerMotive: z.string(),
  strategicAnswer: z.object({
    openingHook: z.string(),
    coreDefense: z.string(),
    preemptiveTradeoff: z.string(),
    keywordsToNail: z.array(z.string())
  })
});

const InterviewStrategyOutputSchema = z.object({
  metadata: z.object({
    title: z.string(),
    matchScoreOriginal: z.number(),
    projectCount: z.number(),
    workExperienceCount: z.number(),
    behavioralCount: z.number(),
    strategyRationale: z.string()
  }),
  projectQuestions: z.array(StrategicQuestionSchema),
  workExperienceQuestions: z.array(StrategicQuestionSchema),
  behavioralQuestions: z.array(StrategicQuestionSchema),
  skillGaps: z.array(z.object({
    skill: z.string(),
    severity: z.enum(["low", "medium", "high"])
  })),
  preparationPlan: z.array(z.object({
    day: z.number(),
    focus: z.string(),
    tasks: z.array(z.object({
      description: z.string(),
      completed: z.boolean().default(false)
    }))
  }))
});

async function generateInterviewReport({ resume, selfDescription, jobDescription, preparationDays = 7 }) {
    const systemPrompt = `You are an Elite Principal Technical Recruiter and Staff Software Engineer at a Tier-1 tech company. Prepare the candidate for a high-stakes interview using the provided [JOB DESCRIPTION] and [REFINED RESUME].

CRITICAL SIZING REQUIREMENT:
- You MUST generate AT LEAST 10 distinct questions in the 'projectQuestions' array.
- You MUST generate AT LEAST 10 distinct questions in the 'workExperienceQuestions' array.
- You MUST construct a step-by-step preparation plan roadmap in the 'preparationPlan' array spanning exactly ${preparationDays} days, where each item in the array corresponds to Day 1, Day 2, ... up to Day ${preparationDays} sequentially. Do not generate plan for any other number of days than ${preparationDays}. For each day, the 'tasks' array must consist of objects, where each object contains a 'description' field detailing the preparation task.
- This is a strict schema and operational constraint. Even if the candidate has only one project or only one work experience entry, do not group questions or stop early. Instead, generate multiple separate questions targeting different aspects of that single entry (e.g., separate questions on different bullet points, technical stack choices, scalability challenges, testing strategies, data storage, integration details, error handling, etc.), or ask how the specific technologies/experiences from that entry relate to concepts in the [JOB DESCRIPTION].

RULE 1 (QUESTION STYLING & INTERVIEW STYLE):
- Frame every question exactly as a real, rigorous interviewer would ask it.
- Ground every question in the specific highlighted keywords, technologies, tools, or phrases in the candidate's resume.
- Make the questions highly technical, concept-based, and/or situational.
  * Situational examples: "In your project, you used React and Express. Imagine a scenario where user sessions are dropping due to token expiration mismatches. How would you debug this?", "You mentioned utilizing Scikit-learn for text preprocessing. If the volume of message data scales to millions per minute, what processing bottlenecks do you expect and how would you resolve them?"
  * Concept-based examples: "In your work experience, you built crop disease classification models using MobileNetV2. Can you explain the core architectural differences and trade-offs between MobileNetV2 and a standard ResNet model?", "You listed 'Service Layer Architecture' as a skill. Explain the difference between a Controller, a Service, and a Data Access Object, and why we segregate them."

RULE 2 (PILLARS & AREAS OF FOCUS):
- 'projectQuestions': Focus heavily on tech-stack selection trade-offs (e.g., why this DB or framework), deep dive into core concepts behind tools used, architectural scaling bottlenecks, and handling edge cases.
- 'workExperienceQuestions': Focus on real-world engineering issues: production debugging, code refactoring, legacy migration, metric tracking/measurement, business impact, and cross-functional ownership/communication.
- 'behavioralQuestions': Map standard cultural fit, conflict resolution, and coping with failure questions to the target seniority level in the JD.

RULE 3 (DEFENSE FORMULA):
Every strategic answer MUST strictly provide:
- openingHook: A single concise sentence validating the interviewer's premise/scenario.
- coreDefense: The technical justification using the STAR (Situation, Task, Action, Result) method.
- preemptiveTradeoff: An explicit, mature admission of a technical trade-off made (e.g., choice of performance over simplicity, memory over CPU, or consistency over availability).

RULE 4 (RESUME-JD CROSS EXAMINATION — apply before generating any project/experience question):
- Identify the 3-4 most critical, non-negotiable requirements implied by the [JOB DESCRIPTION] (core tech stack, seniority level, domain expertise, or scale expectations).
- Cross-reference these against the candidate's resume to find: (a) claims that directly overlap with those critical requirements — weight MORE questions toward stress-testing these, since they matter most to this specific role, and (b) claims that are vague, unquantified, or buzzword-heavy (e.g., "improved performance", "worked with microservices", "led a team") — for each such claim, generate at least one question that forces the candidate to quantify or specify it precisely (numbers, mechanism, decision process), the way a skeptical recruiter would push back on unsubstantiated resume language.
- Every project/experience question must name a specific artifact from the resume (a project name, a technology, a metric, a bullet point) — do not generate generic/textbook questions that could apply to any candidate.
- Calibrate difficulty to the seniority level implied by the JD, for project and experience questions as well as behavioral ones: junior/entry-level JDs should get correctness-and-fundamentals-focused questions; senior/staff-level JDs should get systems-thinking, trade-off ownership, failure-recovery, and cross-functional impact questions grilling the same resume content harder.
- Wherever plausible, frame the question as a challenge to a specific alternative approach the candidate did NOT take (e.g., "why not a message queue instead of polling here", "why REST instead of GraphQL for this specific use case") rather than a neutral "tell me about X" — this mirrors how a real technical interviewer pressure-tests decisions, not just asks for descriptions.`;

    const userPrompt = `Generate a comprehensive interview report for the following candidate:

IMPORTANT SIZING AND CONTENT REQUIREMENT:
- You must generate AT LEAST 10 distinct questions in the 'projectQuestions' array.
- You must generate AT LEAST 10 distinct questions in the 'workExperienceQuestions' array.
- If the candidate has limited work experience entries, do not stop at 5. Instead, generate at least 10 questions by diving deeply into:
  1. Individual bullet points (testing, validation, architecture).
  2. Tech stack trade-offs and tool selections in their work experience.
  3. Scaling, caching, optimizing, and latency concerns.
  4. Failure modes, debugging in production, and retry/fallback mechanisms.
  5. User impact, requirements gathering, and collaboration with team members or cross-functional stakeholders.
  6. Concept-based questions testing their understanding of the underlying theory of the technologies they used.
  7. How their work experience applies to the requirements and challenges of the target Job Description.

Resume:
${resume || "Not provided"}

Self Description:
${selfDescription || "Not provided"}

Job Description:
${jobDescription}`;

    const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
        ],
        response_format: zodResponseFormat(InterviewStrategyOutputSchema, "interview_strategy"),
        temperature: 0.7,
    });

    return JSON.parse(response.choices[0].message.content);
}


// ─── Resume PDF & Template Generation ─────────────────────────────────────────

async function generatePdfFromHtml(htmlContent) {
    const browser = await puppeteerService.getBrowserInstance()
    const page = await browser.newPage()
    try {
        await page.setContent(htmlContent, { waitUntil: "networkidle0" })

        const pdfBuffer = await page.pdf({
            format: "A4",
            printBackground: true,
            preferCSSPageSize: true
        })

        return pdfBuffer
    } finally {
        await page.close()
    }
}

const RefinedResumeSchema = z.object({
  basics: z.object({ 
    name: z.string(), 
    email: z.string(), 
    phone: z.string(), 
    linkedin: z.string(), 
    github: z.string(), 
    portfolio: z.string(),
    location: z.string().nullable()
  }),
  summary: z.string(),
  education: z.array(z.object({ institution: z.string(), degree: z.string(), dates: z.string(), gpa: z.string(), location: z.string() })),
  technicalSkills: z.array(z.object({ category: z.string(), skills: z.array(z.string()) })),
  projects: z.array(z.object({ 
    name: z.string(), 
    dates: z.string(), 
    descriptionBullets: z.array(z.string()),
    githubUrl: z.string(),
    liveUrl: z.string(),
    tools: z.string()
  })),
  workExperience: z.array(z.object({ company: z.string(), role: z.string(), dates: z.string(), location: z.string(), bullets: z.array(z.string()) })),
  positionOfResponsibility: z.array(z.object({
    organization: z.string(),
    title: z.string(),
    dates: z.string(),
    description: z.string()
  })),
  achievements: z.array(z.string())
});

function renderResumeToHtml(data, template, fontFamily = "Arial, Helvetica, sans-serif", zoom = 1.0) {
    const basics = data.basics || {};

    const formatUrl = (url) => {
        if (!url) return "";
        if (url.startsWith("http://") || url.startsWith("https://")) return url;
        return `https://${url}`;
    };

    const formatMarkdown = (text) => {
        if (!text) return "";
        // Replace **text** or __text__ with <strong>text</strong>
        return text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/__(.*?)__/g, '<strong>$1</strong>');
    };

    const formatGpa = (gpa) => {
        if (!gpa) return "";
        const lower = gpa.toLowerCase();
        if (lower.startsWith("gpa") || lower.startsWith("cgpa") || lower.includes("%")) {
            return gpa;
        }
        const num = parseFloat(gpa);
        if (!isNaN(num)) {
            if (num <= 4.0) {
                return `GPA: ${gpa}`;
            } else {
                return `CGPA: ${gpa}`;
            }
        }
        return gpa;
    };


    const isEarly = template === "early" || !template;

    if (isEarly) {
        // --- Early Career Layout (Classic Serif LaTeX Layout) ---
        const phoneIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="#000000" style="vertical-align: middle; margin-right: 4px;"><path d="M20 22.622c-1.311 0-2.868-.316-4.717-1.07-2.617-1.07-5.187-2.73-7.469-4.887-2.282-2.158-3.954-4.582-4.97-7.05-1.016-2.469-1.222-4.662-.61-6.52A5.19 5.19 0 0 1 7.217 0c1.077 0 2.015.65 2.378 1.658l1.47 4.079c.29.804.05 1.705-.595 2.26l-1.446 1.244c.85 1.83 2.072 3.498 3.633 4.97 1.56 1.47 3.328 2.622 5.27 3.428l1.313-1.378a2.152 2.152 0 0 1 2.39-.48l4.316 1.63A2.32 2.32 0 0 1 24 19.6c0 1.666-1.684 3.022-4 3.022z"/></svg>`;
        const emailIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="#000000" style="vertical-align: middle; margin-right: 4px;"><path d="M0 3v18h24v-18h-24zm21.518 2l-9.518 7.713-9.518-7.713h19.036zm-19.518 14v-11.817l10 8.104 10-8.104v11.817h-20z"/></svg>`;
        const linkedinIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="#000000" style="vertical-align: middle; margin-right: 4px;"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.779-1.75-1.75s.784-1.75 1.75-1.75 1.75.779 1.75 1.75-.784 1.75-1.75 1.75zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/></svg>`;
        const githubIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="#000000" style="vertical-align: middle; margin-right: 4px;"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>`;
        const portfolioIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#000000" stroke-width="2" style="vertical-align: middle; margin-right: 4px;"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>`;

        const contactItemsArray = [];
        if (basics.phone) contactItemsArray.push(`<span>${phoneIcon}${basics.phone}</span>`);
        if (basics.email) contactItemsArray.push(`<a href="mailto:${basics.email}" style="color: #000; text-decoration: none;">${emailIcon}${basics.email}</a>`);
        if (basics.linkedin) contactItemsArray.push(`<a href="${formatUrl(basics.linkedin)}" target="_blank" style="color: #000; text-decoration: none;">${linkedinIcon}LinkedIn</a>`);
        if (basics.github) contactItemsArray.push(`<a href="${formatUrl(basics.github)}" target="_blank" style="color: #000; text-decoration: none;">${githubIcon}GitHub</a>`);
        if (basics.portfolio) contactItemsArray.push(`<a href="${formatUrl(basics.portfolio)}" target="_blank" style="color: #000; text-decoration: none;">${portfolioIcon}Portfolio</a>`);
        const contactHtml = contactItemsArray.join(` <span style="color: #000; margin: 0 8px;">|</span> `);

        return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400..800;1,400..800&display=swap" rel="stylesheet">
<style>
  :root {
    --page-margin: ${8 * zoom}mm;
    --font-size-body: ${11 * zoom}px;
    --font-size-name: ${20 * zoom}px;
    --font-size-heading: ${14 * zoom}px;
    --font-size-sub: ${10.5 * zoom}px;
    --margin-section: ${8 * zoom}px;
    --margin-item: ${4 * zoom}px;
    --margin-subheader: ${2 * zoom}px;
  }
  @page { size: A4; margin: var(--page-margin); }
  body {
    font-family: 'EB Garamond', Georgia, serif;
    font-size: var(--font-size-body);
    line-height: 1.35;
    color: #000;
    margin: 0;
    padding: 0;
    background-color: #fff;
  }
  .name {
    font-size: var(--font-size-name);
    font-weight: bold;
    font-variant: small-caps;
    text-transform: lowercase;
    text-align: center;
    margin: 0 0 2px 0;
    letter-spacing: 0.5px;
  }
  .location {
    text-align: center;
    font-size: var(--font-size-body);
    margin-bottom: 4px;
  }
  .contact-container {
    display: block;
    text-align: center;
    font-size: var(--font-size-sub);
    margin-top: 2px;
    margin-bottom: var(--margin-section);
    width: 100%;
  }
  .section-title {
    font-size: var(--font-size-heading);
    font-weight: bold;
    text-align: left;
    margin-top: var(--margin-section);
    margin-bottom: calc(var(--margin-section) / 2);
    padding-bottom: 1px;
    border-bottom: 1px solid #000;
    letter-spacing: 0.5px;
  }
  .entry-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    font-weight: bold;
    margin-bottom: 1px;
    font-size: var(--font-size-body);
  }
  .entry-subheader {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    font-style: italic;
    margin-bottom: var(--margin-subheader);
    font-size: var(--font-size-sub);
  }
  ul {
    list-style-type: disc;
    margin: 2px 0 var(--margin-item) 0;
    padding-left: 15px;
  }
  li {
    margin-bottom: 2px;
    text-align: justify;
  }
  p {
    margin: 0 0 var(--margin-item) 0;
    text-align: justify;
  }
  .dash-list {
    list-style-type: none;
    margin: 2px 0 var(--margin-item) 0;
    padding-left: 15px;
  }
  .dash-list li {
    position: relative;
    margin-bottom: 2px;
    text-align: justify;
  }
  .dash-list li::before {
    content: "\\2013";
    position: absolute;
    left: -12px;
  }
</style>
</head>
<body>
  <div class="name">${basics.name ? basics.name.toLowerCase() : ""}</div>
  ${basics.location ? `<div class="location">${basics.location}</div>` : ""}
  <div class="contact-container">${contactHtml}</div>

  ${data.summary ? `
  <div class="section-title">Summary</div>
  <p>${formatMarkdown(data.summary)}</p>
  ` : ""}

  ${data.education && data.education.length > 0 ? `
  <div class="section-title">Education</div>
  ${data.education.map(edu => {
    const gpaVal = formatGpa(edu.gpa);
    const inst = edu.institution;
    const loc = edu.location;
    const showLoc = loc && !inst.toLowerCase().includes(loc.toLowerCase());
    const instLoc = showLoc ? `${inst}, ${loc}` : inst;
    return `
    <div class="entry-header">
      <span><strong>${formatMarkdown(instLoc)}</strong></span>
      <span><strong>${formatMarkdown(edu.dates)}</strong></span>
    </div>
    <div class="entry-subheader">
      <span><em>${formatMarkdown(edu.degree)}</em></span>
      <span><em>${gpaVal ? formatMarkdown(gpaVal) : ""}</em></span>
    </div>
    `;
  }).join("")}
  ` : ""}

  ${data.technicalSkills && data.technicalSkills.length > 0 ? `
  <div class="section-title">Technical Skills</div>
  <ul style="list-style-type: disc; padding-left: 15px;">
    ${data.technicalSkills.map(skill => `
      <li style="margin-bottom: 3px;"><strong>${skill.category}:</strong> ${skill.skills.join(", ")}</li>
    `).join("")}
  </ul>
  ` : ""}

  ${data.projects && data.projects.length > 0 ? `
  <div class="section-title">Projects</div>
  ${data.projects.map(proj => {
    const projectLinks = [];
    if (proj.githubUrl) {
        projectLinks.push(`<a href="${formatUrl(proj.githubUrl)}" target="_blank" style="color: #000; text-decoration: underline;">GitHub</a>`);
    }
    if (proj.liveUrl) {
        projectLinks.push(`<a href="${formatUrl(proj.liveUrl)}" target="_blank" style="color: #000; text-decoration: underline;">Deployed Link</a>`);
    }
    const projectLinksHtml = projectLinks.length > 0 ? projectLinks.join(" | ") : "";

    return `
    <div class="entry-header">
      <span><strong>${proj.name}</strong></span>
      <span style="font-weight: normal; font-size: 10.5px;">${projectLinksHtml}</span>
    </div>
    ${proj.tools ? `
    <div style="font-style: italic; margin-bottom: 3px; color: #000; font-size: 10.5px;">
      &mdash; Tools Used: ${proj.tools}
    </div>
    ` : ""}
    ${proj.descriptionBullets && proj.descriptionBullets.length > 0 ? `
    <ul class="dash-list">
      ${proj.descriptionBullets.map(bullet => `
        <li>${formatMarkdown(bullet)}</li>
      `).join("")}
    </ul>
    ` : ""}
    `;
  }).join("")}
  ` : ""}

  ${data.workExperience && data.workExperience.length > 0 ? `
  <div class="section-title">Work Experience</div>
  ${data.workExperience.map(work => `
    <div class="entry-header">
      <span><strong>${work.role}</strong></span>
      <span><strong>${work.dates}</strong></span>
    </div>
    <div class="entry-subheader">
      <span><em>${work.company}</em></span>
      <span><em>${work.location}</em></span>
    </div>
    ${work.bullets && work.bullets.length > 0 ? `
    <ul class="dash-list">
      ${work.bullets.map(bullet => `
        <li>${formatMarkdown(bullet)}</li>
      `).join("")}
    </ul>
    ` : ""}
  `).join("")}
  ` : ""}

  ${data.positionOfResponsibility && data.positionOfResponsibility.length > 0 ? `
  <div class="section-title">Position of Responsibility</div>
  ${data.positionOfResponsibility.every(item => typeof item === 'string') ? `
    <ul class="dash-list">
      ${data.positionOfResponsibility.map(item => `<li>${formatMarkdown(item)}</li>`).join("")}
    </ul>
  ` : `
    ${data.positionOfResponsibility.map(item => {
      if (typeof item === 'string') {
          return `<ul class="dash-list"><li>${formatMarkdown(item)}</li></ul>`;
      }
      const descBullets = item.description ? item.description.split('\n').map(b => b.trim().replace(/^-\s*/, '')).filter(Boolean) : [];
      return `
      <div class="entry-header">
        <span><strong>${item.organization || ""}</strong></span>
        <span><strong>${item.dates || ""}</strong></span>
      </div>
      <div class="entry-subheader">
        <span><em>${item.title || ""}</em></span>
      </div>
      ${descBullets.length > 0 ? `
      <ul class="dash-list">
        ${descBullets.map(bullet => `
          <li>${formatMarkdown(bullet)}</li>
        `).join("")}
      </ul>
      ` : ""}
      `;
    }).join("")}
  `}
  ` : ""}

  ${data.achievements && data.achievements.length > 0 ? `
  <div class="section-title">Achievements</div>
  <ul style="list-style-type: disc; padding-left: 15px;">
    ${data.achievements.map(ach => `
      <li>${formatMarkdown(ach)}</li>
    `).join("")}
  </ul>
  ` : ""}
</body>
</html>
        `;
    } else {
        // --- Experienced Track Layout (Modern Sans-Serif Layout) ---
        const phoneIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="#000000" style="vertical-align: middle; margin-right: 4px;"><path d="M20 22.622c-1.311 0-2.868-.316-4.717-1.07-2.617-1.07-5.187-2.73-7.469-4.887-2.282-2.158-3.954-4.582-4.97-7.05-1.016-2.469-1.222-4.662-.61-6.52A5.19 5.19 0 0 1 7.217 0c1.077 0 2.015.65 2.378 1.658l1.47 4.079c.29.804.05 1.705-.595 2.26l-1.446 1.244c.85 1.83 2.072 3.498 3.633 4.97 1.56 1.47 3.328 2.622 5.27 3.428l1.313-1.378a2.152 2.152 0 0 1 2.39-.48l4.316 1.63A2.32 2.32 0 0 1 24 19.6c0 1.666-1.684 3.022-4 3.022z"/></svg>`;
        const emailIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="#000000" style="vertical-align: middle; margin-right: 4px;"><path d="M0 3v18h24v-18h-24zm21.518 2l-9.518 7.713-9.518-7.713h19.036zm-19.518 14v-11.817l10 8.104 10-8.104v11.817h-20z"/></svg>`;
        const linkedinIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="#000000" style="vertical-align: middle; margin-right: 4px;"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.779-1.75-1.75s.784-1.75 1.75-1.75 1.75.779 1.75 1.75-.784 1.75-1.75 1.75zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/></svg>`;
        const githubIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="#000000" style="vertical-align: middle; margin-right: 4px;"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>`;
        const portfolioIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#000000" stroke-width="2" style="vertical-align: middle; margin-right: 4px;"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>`;

        const contactItemsArray = [];
        if (basics.phone) contactItemsArray.push(`<span>${phoneIcon}${basics.phone}</span>`);
        if (basics.email) contactItemsArray.push(`<a href="mailto:${basics.email}" style="color: inherit; text-decoration: none;">${emailIcon}${basics.email}</a>`);
        if (basics.linkedin) contactItemsArray.push(`<a href="${formatUrl(basics.linkedin)}" target="_blank" style="color: inherit; text-decoration: none;">${linkedinIcon}LinkedIn</a>`);
        if (basics.github) contactItemsArray.push(`<a href="${formatUrl(basics.github)}" target="_blank" style="color: inherit; text-decoration: none;">${githubIcon}GitHub</a>`);
        if (basics.portfolio) contactItemsArray.push(`<a href="${formatUrl(basics.portfolio)}" target="_blank" style="color: inherit; text-decoration: none;">${portfolioIcon}Portfolio</a>`);
        const contactHtml = contactItemsArray.join(` <span style="color: #000; margin: 0 8px;">|</span> `);

        return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
  :root {
    --page-margin: ${8 * zoom}mm;
    --font-size-body: ${11 * zoom}px;
    --font-size-name: ${20 * zoom}px;
    --font-size-heading: ${13 * zoom}px;
    --font-size-sub: ${9.5 * zoom}px;
    --font-size-subheader: ${10.5 * zoom}px;
    --margin-section: ${8 * zoom}px;
    --margin-item: ${4 * zoom}px;
    --margin-subheader: ${2 * zoom}px;
  }
  @page { size: A4; margin: var(--page-margin); }
  body {
    font-family: 'Inter', sans-serif;
    font-size: var(--font-size-body);
    line-height: 1.3;
    color: #000;
    margin: 0;
    padding: 0;
    background-color: #fff;
  }
  .name {
    font-size: var(--font-size-name);
    font-weight: bold;
    text-transform: uppercase;
    text-align: center;
    margin: 0 0 4px 0;
    color: #000;
    letter-spacing: 0.5px;
  }
  .contact-container {
    display: block;
    text-align: center;
    font-size: var(--font-size-sub);
    padding: 4px 0;
    margin-top: 4px;
    margin-bottom: var(--margin-section);
    width: 100%;
    color: #000;
  }
  .section-title {
    font-size: var(--font-size-heading);
    font-weight: bold;
    text-transform: uppercase;
    text-align: center;
    margin-top: var(--margin-section);
    margin-bottom: calc(var(--margin-section) / 2);
    padding-top: 3px;
    border-top: 1px solid #000;
    letter-spacing: 0.5px;
  }
  .entry-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    font-weight: bold;
    margin-bottom: 1px;
    font-size: var(--font-size-body);
  }
  .entry-subheader {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    font-style: normal;
    color: #000;
    margin-bottom: var(--margin-subheader);
    font-size: var(--font-size-subheader);
  }
  ul {
    list-style-type: disc;
    margin: 2px 0 var(--margin-item) 0;
    padding-left: 15px;
  }
  li {
    margin-bottom: 2px;
    text-align: justify;
  }
  p {
    margin: 0 0 var(--margin-item) 0;
    text-align: justify;
  }
</style>
</head>
<body>
  <div class="name">${basics.name || ""}</div>
  <div class="contact-container">${contactHtml}</div>

  ${data.summary ? `
  <div class="section-title">Summary</div>
  <p>${formatMarkdown(data.summary)}</p>
  ` : ""}

  ${data.education && data.education.length > 0 ? `
  <div class="section-title">Education</div>
  ${data.education.map(edu => {
    const gpaVal = formatGpa(edu.gpa);
    let degreeType = "";
    let major = "";
    if (edu.degree.includes(",")) {
        const parts = edu.degree.split(",");
        degreeType = parts[0].trim();
        major = parts.slice(1).join(",").trim();
    } else if (edu.degree.toLowerCase().includes(" in ")) {
        const idx = edu.degree.toLowerCase().indexOf(" in ");
        degreeType = edu.degree.substring(0, idx).trim();
        major = edu.degree.substring(idx + 4).trim();
    } else {
        degreeType = "";
        major = edu.degree;
    }

    const leftFirstLine = degreeType ? `${degreeType} | ${edu.institution}` : edu.institution;
    const leftFirstLineWithLocation = edu.location ? `${leftFirstLine} | ${edu.location}` : leftFirstLine;

    return `
    <div class="entry-header">
      <span><strong>${formatMarkdown(leftFirstLineWithLocation)}</strong></span>
      <span><strong>${formatMarkdown(edu.dates)}</strong></span>
    </div>
    <div class="entry-subheader">
      <span>${formatMarkdown(major)}</span>
      <span>${gpaVal ? formatMarkdown(gpaVal) : ""}</span>
    </div>
    `;
  }).join("")}
  ` : ""}

  ${data.workExperience && data.workExperience.length > 0 ? `
  <div class="section-title">Work Experience</div>
  ${data.workExperience.map(work => `
    <div class="entry-header">
      <span><strong>${work.company}${work.role ? ` | ${work.role}` : ""}${work.location ? ` | ${work.location}` : ""}</strong></span>
      <span><strong>${work.dates}</strong></span>
    </div>
    ${work.bullets && work.bullets.length > 0 ? `
    <ul>
      ${work.bullets.map(bullet => `
        <li>${formatMarkdown(bullet)}</li>
      `).join("")}
    </ul>
    ` : ""}
  `).join("")}
  ` : ""}

  ${data.technicalSkills && data.technicalSkills.length > 0 ? `
  <div class="section-title">Technical Skills</div>
  <div style="margin-bottom: 6px; font-size: 11px; line-height: 1.35;">
    ${data.technicalSkills.map(skill => `
      <div style="margin-bottom: 3px;"><strong>${skill.category}:</strong> ${skill.skills.join(", ")}</div>
    `).join("")}
  </div>
  ` : ""}

  ${data.projects && data.projects.length > 0 ? `
  <div class="section-title">Projects</div>
  ${data.projects.map(proj => {
    const projectLinks = [];
    if (proj.githubUrl) {
        projectLinks.push(`<a href="${formatUrl(proj.githubUrl)}" target="_blank" style="color: #000; text-decoration: underline;">GitHub</a>`);
    }
    if (proj.liveUrl) {
        projectLinks.push(`<a href="${formatUrl(proj.liveUrl)}" target="_blank" style="color: #000; text-decoration: underline;">Live</a>`);
    }
    const projectLinksHtml = projectLinks.length > 0 ? projectLinks.join(" | ") : "";

    return `
    <div class="entry-header">
      <span><strong>${proj.name}</strong></span>
      <span style="font-weight: normal; font-size: 10.5px;">${projectLinksHtml}</span>
    </div>
    ${proj.descriptionBullets && proj.descriptionBullets.length > 0 ? `
    <ul>
      ${proj.descriptionBullets.map(bullet => `
        <li>${formatMarkdown(bullet)}</li>
      `).join("")}
    </ul>
    ` : ""}
    `;
  }).join("")}
  ` : ""}

  ${data.positionOfResponsibility && data.positionOfResponsibility.length > 0 ? `
  <div class="section-title">Position of Responsibility</div>
  ${data.positionOfResponsibility.every(item => typeof item === 'string') ? `
    <ul style="list-style-type: disc; padding-left: 15px;">
      ${data.positionOfResponsibility.map(item => `<li>${formatMarkdown(item)}</li>`).join("")}
    </ul>
  ` : `
    ${data.positionOfResponsibility.map(item => {
      if (typeof item === 'string') {
          return `<ul style="list-style-type: disc; padding-left: 15px; margin: 2px 0 4px 0;"><li>${formatMarkdown(item)}</li></ul>`;
      }
      const descBullets = item.description ? item.description.split('\n').map(b => b.trim().replace(/^-\s*/, '')).filter(Boolean) : [];
      return `
      <div class="entry-header">
        <span><strong>${item.organization || ""}${item.title ? ` | ${item.title}` : ""}</strong></span>
        <span><strong>${item.dates || ""}</strong></span>
      </div>
      ${descBullets.length > 0 ? `
      <ul>
        ${descBullets.map(bullet => `
          <li>${formatMarkdown(bullet)}</li>
        `).join("")}
      </ul>
      ` : ""}
      `;
    }).join("")}
  `}
  ` : ""}

  ${data.achievements && data.achievements.length > 0 ? `
  <div class="section-title">Achievements</div>
  <ul>
    ${data.achievements.map(ach => `
      <li>${formatMarkdown(ach)}</li>
    `).join("")}
  </ul>
  ` : ""}
</body>
</html>
        `;
    }
}

async function optimizeResumeHtmlForOnePage(data, template, fontFamily) {
    let page;
    let html = renderResumeToHtml(data, template, fontFamily, 1.0);
    try {
        const browser = await puppeteerService.getBrowserInstance();
        page = await browser.newPage();
        let zoom = 1.0;
        while (zoom >= 0.7) {
            html = renderResumeToHtml(data, template, fontFamily, zoom);
            await page.setContent(html, { waitUntil: "networkidle0" });
            const pdfBuffer = await page.pdf({
                format: "A4",
                printBackground: true,
                preferCSSPageSize: true
            });
            const pdfData = await pdfParse(pdfBuffer);
            if (pdfData.numpages <= 1) {
                break;
            }
            zoom = parseFloat((zoom - 0.05).toFixed(2));
        }
    } catch (err) {
        console.error("Error optimizing resume HTML:", err);
    } finally {
        if (page) {
            await page.close();
        }
    }
    return html;
}

async function generateResumeHtmlAndScore({ resume, selfDescription, jobDescription, template, fontFamily, extractedUrls = [] }) {
    let cacheKey = null;
    let cachedData = null;

    if (redis) {
        try {
            const hashInput = JSON.stringify({ resume, selfDescription, jobDescription });
            const hash = crypto.createHash("sha256").update(hashInput).digest("hex");
            cacheKey = `resume:${hash}`;
            
            const cachedString = await redis.get(cacheKey);
            if (cachedString) {
                cachedData = JSON.parse(cachedString);
                console.log("Redis cache hit for refined resume");
            }
        } catch (cacheErr) {
            console.error("Failed to query Redis cache:", cacheErr.message);
        }
    }

    let refinedResumeData;
    let matchScoreRefined;

    if (cachedData) {
        refinedResumeData = cachedData.data;
        matchScoreRefined = cachedData.matchScoreRefined;
    } else {
        const systemPrompt = `You are an expert resume writer. Refine the user's resume/profile to target the job description. Highlight relevant experiences, use active action-driven verbs, and avoid sounding AI-generated.

CRITICAL KEYWORD & PHRASE BOLDING REQUIREMENT:
You must analyze the candidate's skillset and the target Job Description to strategically identify and bold high-value keywords and phrases. The bolding should be flexible and value-driven: you can bold either a single critical keyword (e.g., a key technology name like "<strong>Google ADK</strong>") or a cohesive, multi-word phrase (e.g., combining action, technology, and quantitative metrics) depending on what maximizes the value, readability, and ATS relevance of the bullet descriptions.
Make sure the resume looks clean and readable by limiting bolding to 2 to 3 key elements (keywords or phrases) per bullet point. Avoid over-bolding generic terms.
Examples of how to apply bolding:
- Bolding quantitative impact: "<strong>achieving 85% accuracy</strong>", "<strong>reducing latency by 40%</strong>", "<strong>ensuring brand safety for 100M+ creators</strong>"
- Bolding technology with system/use case: "<strong>Python and AWS EC2</strong>", "<strong>AWS Lambda exceptions</strong>"
- Bolding single high-value technologies: "<strong>Google ADK</strong>", "<strong>PostgreSQL</strong>", "<strong>Drizzle ORM</strong>"
- Bolding core engineering tasks/architectures: "<strong>fault-tolerant CI/CD pipelines</strong>", "<strong>distributed job orchestration</strong>", "<strong>interactive timeline visualizations</strong>"

Apply this flexible bolding rule using <strong>...</strong> tags inside the bullet descriptions for projects ('projects'), work experience ('workExperience'), and achievements ('achievements').`;

        const userPrompt = `Create a tailored resume targeting this job description.

CRITICAL REQUIREMENT FOR CONTACT LINKS & PROJECT LINKS:
- Look closely at the contact details of the Original Resume/Profile and the list of EXTRACTED HYPERLINKS. Extract the exact hyperlink URLs (e.g. LinkedIn profile, GitHub profile, Portfolio site) and populate the corresponding fields ('linkedin', 'github', 'portfolio') in the 'basics' object with the exact, full URL strings.
- For each project in the 'projects' array, if a project-specific URL (like a GitHub repository or live demo site URL) is found in the original resume or in the list of EXTRACTED HYPERLINKS, populate 'githubUrl' (for GitHub repo links) and 'liveUrl' (for live project site/demo links) accordingly.
- DO NOT generate placeholder strings like "LinkedIn URL" or "GitHub URL". If a link is not present in the original or in the extracted list, set the field to an empty string.

CRITICAL REQUIREMENT FOR LOCATION, TOOLS, & RESPONSIBILITIES:
- Extract the candidate's personal geographic location (e.g., city and state or city and country, like "San Francisco, CA" or "Ranchi, Jharkhand") from the original profile/resume background or self-description, and populate the 'location' field under the 'basics' object. If the location is not present, set it to null.
- For each education entry in the 'education' array, extract the geographic location (e.g., "Ranchi, Jharkhand" or "Ratnagiri, Maharashtra") and populate the 'location' field.
- For each education entry, extract the raw GPA/percentage score (e.g., "8.0625", "86.4%", "8.22/10") into the 'gpa' field without prefixing with words like "GPA:" or "CGPA:" unless already present in the source resume.
- For each project entry in the 'projects' array, extract the tools, libraries, and languages used (e.g., "React (Vite), Node.js, Express.js, MongoDB Atlas, SQL, Git, GitHub, Gradle") and populate the 'tools' field. Do NOT include the tools string inside the project's 'descriptionBullets' array.
- For each entry in 'positionOfResponsibility', map the leadership or volunteer experience ensuring that each item contains 'organization', 'title', 'dates', and 'description' fields.

Extracted Hyperlinks from original PDF (use these to map links accurately):
${extractedUrls && extractedUrls.length > 0 ? extractedUrls.map(u => `- ${u}`).join('\n') : "None detected"}

Original Resume / Profile Background:
${resume || "Not provided"}

Self Description / Core Qualifications:
${selfDescription || "Not provided"}

Target Job Description:
${jobDescription}`;

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            response_format: zodResponseFormat(RefinedResumeSchema, "refined_resume"),
            temperature: 0.7,
        });

        refinedResumeData = JSON.parse(response.choices[0].message.content);

        const scoreResponse = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { 
                    role: "system", 
                    content: `You are an expert ATS scanner. Score this resume JSON against the job description.
                    You must respond with a valid JSON object matching exactly this structure:
                    {
                      "score": <number 0-100, how well the refined resume matches the job description>
                    }`
                },
                { 
                    role: "user", 
                    content: `Job Description:\\n${jobDescription}\\n\\nRefined Resume JSON:\\n${JSON.stringify(refinedResumeData)}` 
                }
            ],
            response_format: { type: "json_object" },
            temperature: 0.2,
        });

        const scoreData = JSON.parse(scoreResponse.choices[0].message.content);
        matchScoreRefined = scoreData.score || 85;

        if (redis && cacheKey) {
            try {
                const ttl = 24 * 60 * 60; // 24 hours in seconds
                await redis.set(cacheKey, JSON.stringify({
                    data: refinedResumeData,
                    matchScoreRefined
                }), "EX", ttl);
                console.log("Cached refined resume in Redis with 24h TTL");
            } catch (cacheErr) {
                console.error("Failed to write to Redis cache:", cacheErr.message);
            }
        }
    }

    const html = await optimizeResumeHtmlForOnePage(refinedResumeData, template, fontFamily);

    return {
        data: refinedResumeData,
        html,
        matchScoreRefined
    };
}

async function generateResumePdf({ htmlContent }) {
    return await generatePdfFromHtml(htmlContent)
}

// ─── Mock Interview Feature ─────────────────────────────────────────

const MockInterviewFeedbackSchema = z.object({
  score: z.number().min(0).max(100),
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
  detailedReview: z.array(z.object({
    question: z.string(),
    answer: z.string(),
    score: z.number().min(0).max(100),
    critique: z.string()
  }))
});

async function generateMockInterviewerQuestion({ resume, jobDescription, history }) {
    const formattedHistory = history.map(msg => `${msg.role === 'interviewer' ? 'Interviewer' : 'Candidate'}: ${msg.content}`).join('\n');

    const systemPrompt = `You are an Elite Principal Technical Recruiter and Staff Software Engineer at a Tier-1 tech company. You are conducting a live, rigorous technical mock interview with a candidate for a position matching the target [JOB DESCRIPTION].

Your objective is to:
1. Ground your questions deeply in the candidate's actual [RESUME] (specifically their listed projects, technologies, and work experience).
2. Avoid chit-chat, friendly introductions, or generic questions like "Tell me about yourself". Get straight to technical screening.
3. If this is the start of the interview (no history is provided), identify a major technical skill, system component, or project where the candidate's resume overlaps with the JD requirements. Ask a specific, conceptual, or situational engineering question about their design or tool selection (e.g. why they chose a specific technology, how they handled scaling, or why a decision was made).
4. If there is conversation history, follow up directly on the candidate's previous answer. Check if they were vague, made assertions without proof, or left out trade-offs. Challenge their decisions, drill down into details (concurrency, caching, database choices, error handling, performance thresholds), and make the questions progressively more challenging.
5. Keep your question concise, professional, and direct. Do not ask multiple independent questions at once. Ask only ONE question at a time.`;

    const userPrompt = `Conduct the mock interview based on the following:

[JOB DESCRIPTION]:
${jobDescription}

[RESUME]:
${resume || "Not provided"}

[CONVERSATION HISTORY]:
${formattedHistory || "No questions have been asked yet. This is the start of the interview."}

Formulate your next single interviewer question. Do not include any prefix, greeting, conversational preamble, or markdown. Output ONLY the raw question text.`;

    const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
        ],
        temperature: 0.7,
    });

    return response.choices[0].message.content.trim();
}

async function generateMockInterviewFeedback({ resume, jobDescription, history }) {
    const formattedHistory = history.map(msg => `${msg.role === 'interviewer' ? 'Interviewer' : 'Candidate'}: ${msg.content}`).join('\n');

    const systemPrompt = `You are an Elite Principal Technical Recruiter and Staff Software Engineer. Analyze the complete transcript of the mock interview and provide detailed, constructive, and highly critical feedback.
    
Assess the candidate's answers based on:
1. Technical accuracy and depth of explanation.
2. Structure of answers (e.g., STAR method, hooks, admissions of trade-offs).
3. Alignment with the [JOB DESCRIPTION].
4. Areas of improvement and recommendations for correct answers.

You must respond with a JSON object matching this schema. Be critical and realistic with the score; do not hand out perfect grades unless the answers are truly staff-level.`;

    const userPrompt = `Analyze this mock interview session:

[JOB DESCRIPTION]:
${jobDescription}

[RESUME]:
${resume || "Not provided"}

[CONVERSATION TRANSCRIPT]:
${formattedHistory}

Evaluate the session and generate the structured feedback.`;

    const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
        ],
        response_format: zodResponseFormat(MockInterviewFeedbackSchema, "mock_interview_feedback"),
        temperature: 0.2,
    });

    return JSON.parse(response.choices[0].message.content);
}

module.exports = { 
    generateInterviewReport, 
    generateResumePdf, 
    generateResumeHtmlAndScore,
    generatePdfFromHtml,
    renderResumeToHtml,
    optimizeResumeHtmlForOnePage,
    generateMockInterviewerQuestion,
    generateMockInterviewFeedback
}