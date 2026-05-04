/**
 * CMR AI Module - Ollama/Mistral Integration
 * Handles all AI-powered resume generation and analysis
 */

const OLLAMA_BASE = 'http://localhost:11434';
const AI_MODEL = 'mistral:latest';

// ── Status ──────────────────────────────────────────────────────────────────

async function checkOllamaStatus() {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── Core streaming call ──────────────────────────────────────────────────────

async function streamOllama(prompt, onChunk) {
  const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: AI_MODEL, prompt, stream: true }),
  });

  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const line of decoder.decode(value).split('\n').filter(Boolean)) {
      try {
        const d = JSON.parse(line);
        if (d.response) {
          full += d.response;
          if (onChunk) onChunk(d.response, full);
        }
      } catch {}
    }
  }
  return full;
}

// ── Full resume generation ───────────────────────────────────────────────────

async function fillResumeFromAI(userPrompt, onChunk) {
  const prompt = `You are an expert professional resume writer. Create a complete, ATS-optimized resume based on the user description below.

OUTPUT ONLY VALID JSON. No markdown code blocks, no explanation text, no preamble. Just the raw JSON object.

Required JSON structure:
{
  "personal": {
    "fullName": "string",
    "jobTitle": "string",
    "email": "string",
    "phone": "string",
    "location": "string",
    "linkedin": "linkedin.com/in/username",
    "summary": "3 compelling sentences highlighting expertise and value"
  },
  "experience": [
    {
      "title": "Job Title",
      "company": "Company Name",
      "startDate": "YYYY-MM",
      "endDate": "",
      "description": "• Achievement with metric (e.g. increased X by Y%)\\n• Second achievement\\n• Third achievement\\n• Fourth achievement"
    }
  ],
  "education": [
    {
      "degree": "Degree Name",
      "school": "University",
      "year": "YYYY"
    }
  ],
  "skills": {
    "technical": "Skill1, Skill2, Skill3, Skill4, Skill5, Skill6, Skill7, Skill8",
    "soft": "Leadership, Communication, Problem Solving, Team Collaboration, Critical Thinking",
    "languages": "English (Fluent)"
  },
  "additional": {
    "certifications": "Certification Name (Year)\\nAnother Certification (Year)",
    "projects": "Project Name - Brief description of what it does and impact\\nAnother Project - Brief description",
    "awards": "Award Name (Year)",
    "volunteer": ""
  }
}

Rules:
- Use realistic names, emails, companies appropriate to the role
- Experience bullets must start with action verbs and include quantified results
- Leave endDate empty if it's the current role (put first experience as current)
- Summary must be under 100 words and ATS-friendly
- If the user doesn't mention specific companies, invent realistic ones
- Skills should match the role described

User description: ${userPrompt}`;

  const raw = await streamOllama(prompt, onChunk);

  // Extract JSON - handles cases where model adds extra text
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('AI response did not contain valid JSON');
  return JSON.parse(match[0]);
}

// ── Section generator ────────────────────────────────────────────────────────

async function generateSectionAI(section, context, onChunk) {
  const prompts = {
    summary: `Write a professional resume summary for this person. Output ONLY the summary text (2-3 sentences, under 80 words, ATS-friendly, no labels):\n${context}`,

    experience: `Write 4 professional resume bullet points for this work experience. Use strong action verbs and include metrics/numbers. Output ONLY the bullet points starting with •:\n${context}`,

    skills: `List the most relevant technical and soft skills for this role. Output in this format only:\nTechnical: skill1, skill2, skill3, skill4, skill5, skill6\nSoft: skill1, skill2, skill3, skill4, skill5\n\nRole/Context: ${context}`,

    coverBody: `Write a professional 3-paragraph cover letter body (no salutation, no sign-off) for this application. Be specific and compelling:\n${context}`,
  };

  const prompt = prompts[section] || `Help with resume ${section}: ${context}`;
  return streamOllama(prompt, onChunk);
}

// ── Cover letter generation ──────────────────────────────────────────────────

async function generateCoverLetterAI(resumeData, coverData, onChunk) {
  const name = resumeData.personal.fullName || 'the applicant';
  const role = coverData.jobTitle || 'the position';
  const company = coverData.company || 'your company';
  const manager = coverData.manager || 'Hiring Manager';
  const skills = resumeData.skills.technical || 'relevant skills';
  const summary = resumeData.personal.summary || '';
  const expList = (resumeData.experience || [])
    .map(e => `- ${e.title} at ${e.company}: ${e.description}`)
    .join('\n');

  const prompt = `Write a professional, personalized cover letter for the following job application.

Applicant: ${name}
Applying for: ${role} at ${company}
Hiring Manager: ${manager}
Key Skills: ${skills}
Professional Summary: ${summary}
Work Experience:
${expList}

Write exactly 3 paragraphs:
1. Opening paragraph: Express specific enthusiasm for this role and company
2. Middle paragraph: Highlight 2 concrete achievements with numbers from their experience that directly match this role
3. Closing paragraph: Clear call to action requesting an interview

Output ONLY the 3 paragraphs as plain text. No salutation. No sign-off. No extra labels.`;

  return streamOllama(prompt, onChunk);
}

// ── AI Resume Analysis ───────────────────────────────────────────────────────

async function analyzeResumeAI(resumeData, onChunk) {
  const expText = (resumeData.experience || [])
    .map(e => `${e.title} at ${e.company} (${e.startDate}–${e.endDate || 'Present'}): ${e.description}`)
    .join('\n\n');

  const prompt = `You are an expert resume reviewer and career coach. Analyze this resume and give specific, actionable feedback.

RESUME:
Name: ${resumeData.personal.fullName || 'Not provided'}
Title: ${resumeData.personal.jobTitle || 'Not provided'}
Summary: ${resumeData.personal.summary || 'Not provided'}

Experience:
${expText || 'None provided'}

Skills: ${resumeData.skills.technical || 'None'} | ${resumeData.skills.soft || 'None'}
Education: ${(resumeData.education || []).map(e => `${e.degree} from ${e.school} (${e.year})`).join(', ') || 'None'}
Certifications: ${resumeData.additional.certifications || 'None'}
Projects: ${resumeData.additional.projects || 'None'}

Provide:
**Overall Score: X/100**

**Strengths (2-3 bullet points)**
• ...

**Critical Improvements Needed (3-5 specific items)**
• ...

**ATS Optimization Tips**
• ...

**Quick Wins (things to fix right now)**
• ...

Be direct, specific, and actionable. No generic advice.`;

  return streamOllama(prompt, onChunk);
}

// ── UI Helpers ───────────────────────────────────────────────────────────────

let aiPanelOpen = false;

function toggleAIPanel() {
  const panel = document.getElementById('aiPanel');
  const fab = document.getElementById('aiFab');
  if (!panel) return;

  aiPanelOpen = !aiPanelOpen;
  panel.classList.toggle('open', aiPanelOpen);
  if (fab) fab.classList.toggle('active', aiPanelOpen);

  if (aiPanelOpen) {
    document.getElementById('aiInput')?.focus();
    checkAndShowOllamaStatus();
  }
}

async function checkAndShowOllamaStatus() {
  const indicator = document.getElementById('aiStatusDot');
  const label = document.getElementById('aiStatusLabel');
  if (!indicator) return;

  indicator.className = 'ai-status-dot checking';
  if (label) label.textContent = 'Checking…';

  const ok = await checkOllamaStatus();
  indicator.className = `ai-status-dot ${ok ? 'online' : 'offline'}`;
  if (label) label.textContent = ok ? 'Mistral Ready' : 'Ollama Offline — run: ollama serve';
}

function appendAIMessage(role, text, streaming = false) {
  const chat = document.getElementById('aiMessages');
  if (!chat) return null;

  const msg = document.createElement('div');
  msg.className = `ai-msg ai-msg-${role}`;

  if (role === 'assistant') {
    const icon = document.createElement('div');
    icon.className = 'ai-msg-icon';
    icon.textContent = '🤖';
    msg.appendChild(icon);
  }

  const bubble = document.createElement('div');
  bubble.className = 'ai-msg-bubble';
  bubble.textContent = text;
  msg.appendChild(bubble);

  if (streaming) msg.dataset.streaming = 'true';
  chat.appendChild(msg);
  chat.scrollTop = chat.scrollHeight;
  return bubble;
}

function updateStreamingMessage(bubble, text) {
  if (bubble) {
    bubble.textContent = text;
    const chat = document.getElementById('aiMessages');
    if (chat) chat.scrollTop = chat.scrollHeight;
  }
}

function setAILoading(loading) {
  const btn = document.getElementById('aiSendBtn');
  const input = document.getElementById('aiInput');
  if (btn) {
    btn.disabled = loading;
    btn.innerHTML = loading
      ? '<span class="ai-spinner"></span>'
      : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';
  }
  if (input) input.disabled = loading;
}

// ── Main action handlers ─────────────────────────────────────────────────────

async function sendAIMessage() {
  const input = document.getElementById('aiInput');
  if (!input) return;

  const text = input.value.trim();
  if (!text) return;

  input.value = '';
  appendAIMessage('user', text);
  setAILoading(true);

  const bubble = appendAIMessage('assistant', '…');

  try {
    const ok = await checkOllamaStatus();
    if (!ok) {
      updateStreamingMessage(bubble, '❌ Ollama is not running. Please start it with: ollama serve\n\nThen make sure mistral is available: ollama pull mistral');
      setAILoading(false);
      return;
    }

    // Detect intent from user message
    const lower = text.toLowerCase();
    if (lower.includes('fill') || lower.includes('create') || lower.includes('generate resume') ||
        lower.includes('i am') || lower.includes("i'm") || lower.includes('years') ||
        lower.includes('engineer') || lower.includes('developer') || lower.includes('manager')) {
      await handleFillResume(text, bubble);
    } else if (lower.includes('cover letter')) {
      await handleCoverLetter(bubble);
    } else if (lower.includes('analyze') || lower.includes('review') || lower.includes('score')) {
      await handleAnalyze(bubble);
    } else if (lower.includes('summary') || lower.includes('improve')) {
      await handleImprove(text, bubble);
    } else {
      // General AI response
      const result = await streamOllama(
        `You are a helpful resume writing assistant. Answer this question about resume writing concisely: ${text}`,
        (_, full) => updateStreamingMessage(bubble, full)
      );
      updateStreamingMessage(bubble, result);
    }
  } catch (err) {
    updateStreamingMessage(bubble, `❌ Error: ${err.message}\n\nMake sure Ollama is running with: ollama serve`);
  }

  setAILoading(false);
}

async function handleFillResume(prompt, bubble) {
  updateStreamingMessage(bubble, '🔄 Generating your complete resume with Mistral AI…\n\nThis may take 20-30 seconds.');

  const data = await fillResumeFromAI(prompt, (_, full) => {
    const lines = full.split('\n').length;
    updateStreamingMessage(bubble, `🔄 Generating resume… (${lines} lines processed)`);
  });

  // Populate the form
  populateFormWithAIData(data);
  updateStreamingMessage(bubble,
    `✅ Resume generated successfully!\n\n📝 Filled in:\n• Personal info & professional summary\n• ${(data.experience || []).length} work experience entries\n• ${(data.education || []).length} education entries\n• Technical & soft skills\n• Additional sections\n\nReview the preview on the right and customize any details!`
  );

  // Trigger form update
  if (typeof updatePreview === 'function') updatePreview();
  if (typeof updateATSScore === 'function') updateATSScore();
}

async function handleCoverLetter(bubble) {
  if (typeof collectDataFromForm === 'function') collectDataFromForm();

  updateStreamingMessage(bubble, '✍️ Writing your cover letter with AI…');

  const coverData = typeof coverLetterData !== 'undefined' ? coverLetterData : {};
  const rData = typeof resumeData !== 'undefined' ? resumeData : {};

  let result = '';
  result = await generateCoverLetterAI(rData, coverData, (_, full) => {
    updateStreamingMessage(bubble, `✍️ Writing cover letter…\n\n${full}`);
  });

  // Split into paragraphs and fill form fields
  const paragraphs = result.trim().split(/\n\n+/);
  if (typeof setValue === 'function') {
    setValue('coverOpening', paragraphs[0] || '');
    setValue('coverFit', paragraphs[1] || result);
    setValue('coverClosing', paragraphs[2] || '');
  }

  if (typeof updateCoverPreview === 'function') updateCoverPreview();
  if (typeof showTab === 'function') showTab('coverletter');

  updateStreamingMessage(bubble,
    `✅ Cover letter generated!\n\nI've filled the cover letter form. Switch to the Cover Letter tab to see and customize it.\n\n📄 Generated ${paragraphs.length} professional paragraphs tailored to your experience.`
  );
}

async function handleAnalyze(bubble) {
  if (typeof collectDataFromForm === 'function') collectDataFromForm();
  const rData = typeof resumeData !== 'undefined' ? resumeData : {};

  updateStreamingMessage(bubble, '🔍 Analyzing your resume with AI…');

  let result = '';
  result = await analyzeResumeAI(rData, (_, full) => {
    updateStreamingMessage(bubble, full);
  });

  updateStreamingMessage(bubble, result);
}

async function handleImprove(prompt, bubble) {
  if (typeof collectDataFromForm === 'function') collectDataFromForm();
  const rData = typeof resumeData !== 'undefined' ? resumeData : {};

  const context = `${prompt}\nCurrent summary: ${rData.personal?.summary || 'None'}\nJob title: ${rData.personal?.jobTitle || 'Unknown'}`;

  updateStreamingMessage(bubble, '✨ Improving your summary…');

  let result = '';
  result = await generateSectionAI('summary', context, (_, full) => {
    updateStreamingMessage(bubble, `✨ New summary:\n\n${full}`);
  });

  // Offer to apply
  if (result && typeof setValue === 'function') {
    const clean = result.replace(/^(summary:|new summary:)\s*/i, '').trim();
    updateStreamingMessage(bubble, `✨ Suggested summary:\n\n"${clean}"\n\n↑ Applied to your form! Check the Professional Summary field.`);
    setValue('summary', clean);
    if (typeof updatePreview === 'function') updatePreview();
  }
}

// Quick action buttons
async function aiQuickAction(action) {
  const input = document.getElementById('aiInput');
  const prompts = {
    fill: 'Describe yourself briefly and I\'ll generate your full resume',
    cover: 'Generate a professional cover letter based on my current resume data',
    analyze: 'Analyze my resume and give me specific improvement suggestions',
    improve: 'Improve my professional summary to be more compelling and ATS-friendly',
  };

  if (action === 'fill') {
    if (input) {
      input.placeholder = 'e.g. "I\'m a Java developer with 4 years at Wipro, worked on Spring Boot microservices and React frontends, B.Tech from VIT 2020"';
      input.focus();
    }
    appendAIMessage('assistant', '👋 Tell me about yourself and I\'ll create your complete resume!\n\nExample: "I\'m a software engineer with 5 years experience, worked at TCS on Java and React, have AWS certification, B.Tech from VIT Vellore"');
    return;
  }

  if (!document.getElementById('aiPanel')?.classList.contains('open')) toggleAIPanel();

  const fakeMsg = prompts[action];
  if (input) input.value = fakeMsg;
  await sendAIMessage();
}

// ── Form population from AI data ─────────────────────────────────────────────

function populateFormWithAIData(data) {
  if (!data) return;

  // Personal
  if (data.personal) {
    const p = data.personal;
    if (typeof setValue === 'function') {
      setValue('fullName', p.fullName || '');
      setValue('jobTitle', p.jobTitle || '');
      setValue('email', p.email || '');
      setValue('phone', p.phone || '');
      setValue('location', p.location || '');
      setValue('linkedin', p.linkedin || '');
      setValue('summary', p.summary || '');
    }
    // Update global state
    if (typeof resumeData !== 'undefined') {
      Object.assign(resumeData.personal, p);
    }
  }

  // Skills
  if (data.skills && typeof setValue === 'function') {
    setValue('technicalSkills', data.skills.technical || '');
    setValue('softSkills', data.skills.soft || '');
    setValue('languages', data.skills.languages || '');
    if (typeof resumeData !== 'undefined') {
      resumeData.skills = { ...resumeData.skills, ...data.skills };
    }
  }

  // Additional
  if (data.additional && typeof setValue === 'function') {
    setValue('certifications', data.additional.certifications || '');
    setValue('projects', data.additional.projects || '');
    setValue('awards', data.additional.awards || '');
    setValue('volunteer', data.additional.volunteer || '');
    if (typeof resumeData !== 'undefined') {
      resumeData.additional = { ...resumeData.additional, ...data.additional };
    }
  }

  // Experience
  if (data.experience && Array.isArray(data.experience)) {
    if (typeof resumeData !== 'undefined') resumeData.experience = [];
    const list = document.getElementById('experienceList');
    if (list) list.innerHTML = '';
    data.experience.forEach((exp, i) => {
      if (typeof addExperience === 'function') {
        addExperience({
          id: `ai-exp-${Date.now()}-${i}`,
          title: exp.title || '',
          company: exp.company || '',
          startDate: exp.startDate || '',
          endDate: exp.endDate || '',
          description: exp.description || '',
        });
      }
    });
  }

  // Education
  if (data.education && Array.isArray(data.education)) {
    if (typeof resumeData !== 'undefined') resumeData.education = [];
    const list = document.getElementById('educationList');
    if (list) list.innerHTML = '';
    data.education.forEach((edu, i) => {
      if (typeof addEducation === 'function') {
        addEducation({
          id: `ai-edu-${Date.now()}-${i}`,
          degree: edu.degree || '',
          school: edu.school || '',
          year: edu.year || '',
        });
      }
    });
  }

  // Auto-save
  if (typeof autoSaveData === 'function') autoSaveData();
}

// ── AI panel keyboard shortcut ───────────────────────────────────────────────

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'j') {
    e.preventDefault();
    if (document.getElementById('aiPanel')) toggleAIPanel();
  }
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    const input = document.getElementById('aiInput');
    if (input && document.activeElement === input) {
      e.preventDefault();
      sendAIMessage();
    }
  }
});

// ── Cover page AI ────────────────────────────────────────────────────────────

async function generateAICover() {
  const btn = document.querySelector('[onclick="generateAICover()"]');
  if (btn) {
    btn.textContent = '⏳ Generating…';
    btn.disabled = true;
  }

  try {
    const ok = await checkOllamaStatus();
    if (!ok) {
      alert('Ollama is not running.\n\nStart it with: ollama serve\nThen pull Mistral: ollama pull mistral');
      return;
    }

    if (typeof collectDataFromForm === 'function') collectDataFromForm();
    const rData = typeof resumeData !== 'undefined' ? resumeData : { personal: {}, experience: [], education: [], skills: {}, additional: {} };
    const cData = typeof coverLetterData !== 'undefined' ? coverLetterData : {};

    let result = await generateCoverLetterAI(rData, cData, (_, full) => {
      const preview = document.getElementById('coverPreview');
      if (preview) {
        const existing = preview.querySelector('.cover-letter-content');
        if (existing) {
          const body = existing.querySelector('.cover-body');
          if (body) body.innerHTML = `<p>${full.replace(/\n\n/g, '</p><p>')}</p>`;
        }
      }
    });

    const paragraphs = result.trim().split(/\n\n+/);
    if (typeof setValue === 'function') {
      setValue('coverOpening', paragraphs[0] || '');
      setValue('coverFit', paragraphs[1] || result);
      setValue('coverClosing', paragraphs[2] || '');
    }

    if (typeof updateCoverPreview === 'function') updateCoverPreview();
    alert('✅ Cover letter generated! Review and edit the preview on the right.');
  } catch (err) {
    alert(`AI Error: ${err.message}`);
  } finally {
    if (btn) {
      btn.textContent = '🤖 AI Assist';
      btn.disabled = false;
    }
  }
}

// ── AI TEMPLATE GENERATOR ─────────────────────────────────────────────────────

let aiGeneratedTemplateHTML = null;

async function generateAITemplate(stylePrompt, bubble) {
  const prompt = `You are an expert HTML/CSS resume template designer. Create a complete, beautiful, modern resume template HTML fragment.

REQUIREMENTS:
- Output ONLY the HTML fragment (no full HTML document, no markdown code blocks)
- First element: <div class="resume-template ai-generated-template">
- Must include ALL these IDs: previewName, previewJobTitle, previewEmail, previewPhone, previewLocation, previewLinkedIn, previewSummary, previewExperience, previewEducation, previewSkills, previewLanguages, previewCertifications, previewProjects, previewAwards, profilePhoto
- profilePhoto element: width:110px; height:110px; border-radius:50%; background-size:cover; background-position:center;
- Include all CSS in a <style> tag at the END
- Use CSS variable: var(--primary-color, #6366f1) for accent color
- skills-list divs use class="skills-list"
- Lists (certs, projects, awards) use <ul> tags
- Make it visually stunning, print-ready, A4-proportioned

Style description: ${stylePrompt}

Output the complete HTML+CSS fragment now:`;

  let htmlResult = '';
  await streamOllama(prompt, (_, full) => {
    htmlResult = full;
    if (bubble) updateStreamingMessage(bubble, `🎨 Generating template… (${full.length} chars)`);
  });

  // Clean up: remove markdown code fences if present
  htmlResult = htmlResult
    .replace(/^```html?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();

  if (!htmlResult.includes('resume-template')) {
    throw new Error('AI did not generate a valid template');
  }

  return htmlResult;
}

async function handleAITemplate(prompt, bubble) {
  updateStreamingMessage(bubble, '🎨 Designing your custom template with Mistral AI…\nThis takes 30-60 seconds.');

  try {
    const html = await generateAITemplate(prompt, bubble);
    aiGeneratedTemplateHTML = html;

    // Inject into preview
    const previewContent = document.getElementById('previewContent');
    if (previewContent) {
      previewContent.innerHTML = html;
      if (typeof populateTemplate === 'function') populateTemplate();
      if (typeof applyCustomizations === 'function') applyCustomizations();
    }

    // Add to dropdown and select it
    const select = document.getElementById('templateSelect');
    if (select) {
      const opt = document.getElementById('aiCustomOption') || document.createElement('option');
      opt.id = 'aiCustomOption';
      opt.value = 'ai-custom';
      opt.textContent = `✨ AI: ${prompt.slice(0, 30)}…`;
      opt.style.display = '';
      if (!document.getElementById('aiCustomOption')) select.appendChild(opt);
      select.value = 'ai-custom';
      if (typeof uiSettings !== 'undefined') uiSettings.template = 'ai-custom';
    }

    // Override renderPreview to use AI template when selected
    window._aiTemplateHTML = html;

    updateStreamingMessage(bubble,
      `✅ Custom template created!\n\nYour AI-designed template is now showing in the preview. You can:\n• Edit it directly (click on text in preview)\n• Download as PDF\n• Change your data and it updates live\n\nWant a different style? Just ask me again!`
    );
  } catch (err) {
    updateStreamingMessage(bubble, `❌ Template generation failed: ${err.message}\n\nTry a simpler description like "modern dark template with sidebar"`);
  }
}

// ── EDITABLE PREVIEW ──────────────────────────────────────────────────────────

function toggleEditablePreview() {
  const preview = document.getElementById('previewContent');
  if (!preview) return;

  const isEditable = preview.contentEditable === 'true';

  if (isEditable) {
    preview.contentEditable = 'false';
    preview.style.outline = '';
    const btn = document.getElementById('editPreviewBtn');
    if (btn) { btn.textContent = '✏️ Edit Preview'; btn.classList.remove('active'); }
    showSuccessToast('Preview editing saved');
  } else {
    preview.contentEditable = 'true';
    preview.style.outline = '2px dashed var(--primary-color)';
    preview.style.outlineOffset = '4px';
    const btn = document.getElementById('editPreviewBtn');
    if (btn) { btn.textContent = '💾 Save Edits'; btn.classList.add('active'); }
    showSuccessToast('Click any text in the preview to edit it directly');
  }
}

function showSuccessToast(msg) {
  if (typeof showSuccessMessage === 'function') { showSuccessMessage('✅ ' + msg); return; }
  const t = document.createElement('div');
  t.style.cssText = 'position:fixed;top:80px;right:24px;background:#10b981;color:#fff;padding:12px 18px;border-radius:10px;font-size:.85rem;z-index:9999;animation:fadeIn .3s ease';
  t.textContent = '✅ ' + msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

// Override renderPreview to support ai-custom template
const _origRenderPreview = typeof renderPreview !== 'undefined' ? renderPreview : null;
document.addEventListener('DOMContentLoaded', () => {
  if (window._origRenderPreview === undefined) {
    window._origRenderPreview = window.renderPreview;
    window.renderPreview = async function() {
      if (typeof uiSettings !== 'undefined' && uiSettings.template === 'ai-custom' && window._aiTemplateHTML) {
        const pc = document.getElementById('previewContent');
        if (pc) {
          pc.innerHTML = window._aiTemplateHTML;
          if (typeof populateTemplate === 'function') populateTemplate();
          if (typeof applyCustomizations === 'function') applyCustomizations();
        }
        return;
      }
      return window._origRenderPreview.call(this);
    };
  }
});

// ── Extend sendAIMessage to detect template requests ─────────────────────────
const _origSendAIMessage = typeof sendAIMessage !== 'undefined' ? sendAIMessage : null;

async function sendAIMessageExtended() {
  const input = document.getElementById('aiInput');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;

  const lower = text.toLowerCase();
  const isTemplateReq = lower.includes('template') || lower.includes('design') ||
    lower.includes('dark template') || lower.includes('glass') ||
    lower.includes('create a template') || lower.includes('generate template');

  if (isTemplateReq && document.getElementById('previewContent')) {
    input.value = '';
    appendAIMessage('user', text);
    setAILoading(true);
    const bubble = appendAIMessage('assistant', '…');
    await handleAITemplate(text, bubble);
    setAILoading(false);
    return;
  }

  return sendAIMessage();
}

// Replace the send button to use extended version
document.addEventListener('DOMContentLoaded', () => {
  const sendBtn = document.getElementById('aiSendBtn');
  if (sendBtn) {
    sendBtn.onclick = sendAIMessageExtended;
  }
  const aiInput = document.getElementById('aiInput');
  if (aiInput) {
    aiInput.onkeydown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        sendAIMessageExtended();
      }
    };
  }
});

// ── Rule-based tips (fallback when Ollama is offline) ───────────────────────

function generateRuleBasedTips(rd) {
  const tips = [];
  const summary = rd.personal?.summary || '';
  const exp = rd.experience || [];
  const tech = rd.skills?.technical || '';
  const techList = tech.split(',').map(s => s.trim()).filter(Boolean);

  if (!rd.personal?.fullName?.trim()) tips.push('1. [Contact]: Add your full name — it\'s the first thing recruiters check.');
  else if (!rd.personal?.linkedin?.trim()) tips.push('1. [Contact]: Add a LinkedIn URL — 87% of recruiters use LinkedIn to verify candidates.');

  if (summary.trim().split(/\s+/).length < 30) tips.push('2. [Summary]: Expand your summary to 30–80 words. Include your role title, years of experience, and 2-3 key strengths.');
  else tips.push('2. [Summary]: Your summary looks solid. Make sure it contains your target job title as a keyword for ATS matching.');

  const hasNumbers = exp.some(e => /\d+/.test(e.description || ''));
  if (!hasNumbers) tips.push('3. [Experience]: Add quantified achievements — numbers like "increased revenue by 30%" improve ATS ranking and recruiter interest.');
  else tips.push('3. [Experience]: Great — you have numbers in your experience. Ensure each bullet starts with an action verb (Led, Built, Improved).');

  if (techList.length < 6) tips.push(`4. [Skills]: You have ${techList.length} technical skills listed. Aim for 8–12 relevant keywords that match job descriptions in your field.`);
  else tips.push('4. [Skills]: Good skill count. Prioritize skills that appear in the job description you\'re targeting for better ATS keyword matching.');

  if (!rd.additional?.certifications?.trim()) tips.push('5. [Additional]: Add certifications (AWS, Google, PMP, etc.) — they boost ATS keyword density and show continuous learning.');
  else tips.push('5. [Additional]: Certifications listed — excellent. Consider adding a Projects section to showcase practical application of your skills.');

  return tips.join('\n\n');
}

// ── AI-Powered ATS Analysis ──────────────────────────────────────────────────

async function runAIAtsAnalysis() {
  const feedbackEl = document.getElementById('aiAtsFeedback');
  const btn = document.getElementById('aiAtsBtn');
  if (!feedbackEl) return;

  // Build resume summary from form data
  const rd = typeof resumeData !== 'undefined' ? resumeData : null;
  // Check if there's any meaningful data (don't require fullName specifically)
  const hasData = rd && (
    rd.personal?.fullName?.trim() ||
    rd.personal?.summary?.trim() ||
    (rd.experience?.length > 0) ||
    rd.skills?.technical?.trim()
  );
  if (!hasData) {
    feedbackEl.innerHTML = '<p class="ai-ats-text" style="color:#e11d48">Please fill in at least some resume details (name, summary, or experience) first.</p>';
    return;
  }

  feedbackEl.innerHTML = '<div class="ai-ats-loading">Analyzing your resume with AI...</div>';
  if (btn) btn.disabled = true;

  const ok = await checkOllamaStatus();
  if (!ok) {
    // Fallback: generate rule-based tips without Ollama
    const tips = generateRuleBasedTips(rd);
    feedbackEl.innerHTML = `
      <div style="margin-bottom:10px;padding:8px 12px;background:rgba(251,191,36,0.1);border:1px solid rgba(251,191,36,0.3);border-radius:8px;font-size:0.75rem;color:#b45309;">
        ⚠️ Ollama not running — showing rule-based tips instead. Run <code>ollama serve</code> for AI analysis.
      </div>
      <p class="ai-ats-text">${tips}</p>`;
    if (btn) btn.disabled = false;
    return;
  }

  const expSummary = (rd.experience || []).slice(0,3).map(e =>
    `- ${e.title} at ${e.company}: ${(e.description||'').substring(0,120)}`
  ).join('\n');

  const prompt = `You are an expert resume coach and ATS (Applicant Tracking System) specialist. Analyze this resume and provide concise, actionable feedback.

RESUME DATA:
Name: ${rd.personal.fullName}
Target Role: ${rd.personal.jobTitle}
Summary: ${(rd.personal.summary||'').substring(0,300)}
Experience count: ${(rd.experience||[]).length}
${expSummary}
Technical Skills: ${rd.skills?.technical || 'none listed'}
Soft Skills: ${rd.skills?.soft || 'none listed'}
Education count: ${(rd.education||[]).length}
Certifications: ${rd.additional?.certifications || 'none'}

Provide EXACTLY 5 specific, actionable recommendations to improve this resume for ATS and recruiters. Format as:
1. [Category]: Specific recommendation
2. [Category]: Specific recommendation
(etc.)

Keep each point under 2 sentences. Be direct and specific to this resume.`;

  try {
    const pre = document.createElement('p');
    pre.className = 'ai-ats-text';
    feedbackEl.innerHTML = '';
    feedbackEl.appendChild(pre);

    await streamOllama(prompt, chunk => {
      pre.textContent += chunk;
    });
  } catch (err) {
    feedbackEl.innerHTML = `<p class="ai-ats-text" style="color:#e11d48">Error: ${err.message}</p>`;
  } finally {
    if (btn) btn.disabled = false;
  }
}

window.runAIAtsAnalysis = runAIAtsAnalysis;
