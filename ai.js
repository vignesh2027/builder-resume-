/**
 * CMR AI Module — Groq (llama-3.1-8b-instant)
 * Free: 14,400 req/day — enough for 10,000+ resumes per day
 * Client-side rate limit: 30 req/device/day to protect the shared key
 */

const GROQ_BASE = 'https://api.groq.com/openai/v1';
const GROQ_MODEL = 'llama-3.1-8b-instant';
const _k = (p=>atob(p.join('')))(['Z3NrX','3BuOFh','tVVl5VF','M2VldrW','EF1QUpx','V0dkeWI','zRllKOT','B3MXc2M','2lFd3BY','d3J5cmV','Yb3dtblA=']);
const DEVICE_DAILY_LIMIT = 30;

// ── Rate limiter (per device, resets at midnight) ─────────────────
function getRateData() {
  try {
    const d = JSON.parse(localStorage.getItem('cmr_rl') || '{}');
    const today = new Date().toDateString();
    if (d.date !== today) return { date: today, count: 0 };
    return d;
  } catch { return { date: new Date().toDateString(), count: 0 }; }
}
function bumpRate() {
  const d = getRateData();
  d.count++;
  localStorage.setItem('cmr_rl', JSON.stringify(d));
  return d.count;
}
function getRemainingToday() {
  return Math.max(0, DEVICE_DAILY_LIMIT - getRateData().count);
}

// ── Status indicator ──────────────────────────────────────────────
function updateAIStatus(ready) {
  const dot = document.getElementById('aiStatusDot');
  const label = document.getElementById('aiStatusLabel');
  const rem = getRemainingToday();
  if (dot) dot.style.background = ready ? '#22c55e' : '#f59e0b';
  if (label) label.textContent = ready ? `AI Ready · ${rem} left today` : 'AI Unavailable';
}

// ── Core Groq call ────────────────────────────────────────────────
async function callGroq(systemPrompt, userPrompt, maxTokens) {
  const remaining = getRemainingToday();
  if (remaining <= 0) {
    throw new Error('Daily limit reached (30 requests/device/day). Resets at midnight.');
  }

  bumpRate();

  const res = await fetch(`${GROQ_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${_k}`
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: maxTokens || 2048,
      temperature: 0.7
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Error ${res.status}`);
  }

  const data = await res.json();
  updateAIStatus(true);
  return data.choices?.[0]?.message?.content || '';
}

// ── Resume generation ─────────────────────────────────────────────
async function generateResumeFromAI(description, onChunk) {
  const system = `You are a professional resume writer. Generate ATS-optimized resumes as valid JSON only. No markdown, no explanation, just the JSON object.`;
  const user = `Create a complete professional resume for: ${description}

Return ONLY this JSON (fill all fields with realistic professional content):
{"name":"","jobTitle":"","email":"","phone":"","location":"City, Country","linkedin":"","summary":"3-4 sentence summary with quantifiable achievements","experience":[{"title":"","company":"","startDate":"YYYY-MM","endDate":"YYYY-MM","description":"• Achievement with metric\\n• Achievement\\n• Achievement"}],"education":[{"degree":"","school":"","startDate":"YYYY","endDate":"YYYY","description":""}],"skills":["skill1","skill2","skill3"],"projects":["Project — description with outcome"],"certifications":["Cert name — Issuer"],"awards":["Award name"],"languages":["English (Fluent)"]}`;

  const result = await callGroq(system, user, 2048);
  if (onChunk) onChunk(result);
  return result;
}

// ── Cover letter ──────────────────────────────────────────────────
async function generateAICover(data, onChunk) {
  const system = 'You are a professional cover letter writer. Write compelling, specific cover letters.';
  const user = `Write a professional cover letter for ${data.name || 'the applicant'} applying as ${data.jobTitle || 'a professional'}. Background: ${data.summary || ''}. 3 paragraphs, ~220 words, strong opening hook, 2 specific achievements, confident close. Professional tone.`;
  const result = await callGroq(system, user, 512);
  if (onChunk) onChunk(result);
  return result;
}

// ── UI helpers ────────────────────────────────────────────────────
function addMessageToChat(role, content) {
  const messages = document.getElementById('aiMessages');
  if (!messages) return null;
  const div = document.createElement('div');
  div.className = `ai-msg ai-msg-${role}`;
  div.textContent = content;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
  return div;
}

function updateStreamingMessage(div, text) {
  if (!div) return;
  div.textContent = text;
  const m = document.getElementById('aiMessages');
  if (m) m.scrollTop = m.scrollHeight;
}

// ── Apply JSON to form ────────────────────────────────────────────
function applyAIResume(jsonStr) {
  let data;
  try {
    const clean = jsonStr.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim();
    // Extract JSON if surrounded by other text
    const match = clean.match(/\{[\s\S]*\}/);
    data = JSON.parse(match ? match[0] : clean);
  } catch(e) { return false; }

  function set(id, val) {
    const el = document.getElementById(id);
    if (el && val) { el.value = val; el.dispatchEvent(new Event('input')); }
  }

  set('fullName', data.name); set('jobTitle', data.jobTitle);
  set('email', data.email); set('phone', data.phone);
  set('location', data.location); set('linkedin', data.linkedin);
  set('summary', data.summary);

  if (Array.isArray(data.experience) && typeof addExperienceEntry === 'function') {
    const list = document.getElementById('experienceList');
    if (list) list.innerHTML = '';
    data.experience.forEach(exp => {
      addExperienceEntry();
      const items = document.querySelectorAll('#experienceList .experience-item');
      const last = items[items.length - 1];
      if (!last) return;
      const s = (sel, val) => { const el = last.querySelector(sel); if (el && val) { el.value = val; el.dispatchEvent(new Event('input')); }};
      s('[name="expTitle"]', exp.title); s('[name="expCompany"]', exp.company);
      s('[name="expStart"]', exp.startDate); s('[name="expEnd"]', exp.endDate);
      s('[name="expDesc"]', exp.description);
    });
  }

  if (Array.isArray(data.education) && typeof addEducationEntry === 'function') {
    const list = document.getElementById('educationList');
    if (list) list.innerHTML = '';
    data.education.forEach(edu => {
      addEducationEntry();
      const items = document.querySelectorAll('#educationList .education-item');
      const last = items[items.length - 1];
      if (!last) return;
      const s = (sel, val) => { const el = last.querySelector(sel); if (el && val) { el.value = val; el.dispatchEvent(new Event('input')); }};
      s('[name="eduDegree"]', edu.degree); s('[name="eduSchool"]', edu.school);
      s('[name="eduStart"]', edu.startDate); s('[name="eduEnd"]', edu.endDate);
      s('[name="eduDesc"]', edu.description);
    });
  }

  const skillsEl = document.getElementById('skills');
  if (skillsEl && Array.isArray(data.skills)) { skillsEl.value = data.skills.join(', '); skillsEl.dispatchEvent(new Event('input')); }

  ['projects','certifications','awards','languages'].forEach(key => {
    const el = document.getElementById(key);
    if (el && Array.isArray(data[key]) && data[key].length) { el.value = data[key].join('\n'); el.dispatchEvent(new Event('input')); }
  });

  if (typeof updatePreview === 'function') updatePreview();
  return true;
}

// ── Main send handler ─────────────────────────────────────────────
async function sendAIMessage() {
  const input = document.getElementById('aiInput');
  const sendBtn = document.getElementById('aiSendBtn');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;

  input.value = '';
  addMessageToChat('user', text);
  if (sendBtn) sendBtn.disabled = true;
  const bubble = addMessageToChat('bot', '⏳ Thinking...');

  try {
    const lower = text.toLowerCase();

    if (lower.includes('i am') || lower.includes("i'm") || lower.includes('fill') ||
        lower.includes('generate') || lower.includes('create my resume') || lower.includes('i have')) {
      updateStreamingMessage(bubble, '⏳ Generating your resume with AI...');
      const json = await generateResumeFromAI(text);
      const ok = json ? applyAIResume(json) : false;
      updateStreamingMessage(bubble, ok
        ? `✅ Resume filled! Review the preview — edit anything you want.\n\n${getRemainingToday()} AI requests remaining today.`
        : '⚠️ Could not parse. Try: "I am a software engineer with 5 years at TCS, B.Tech from VIT 2020, skilled in Java and React"');

    } else if ((lower.includes('improve') || lower.includes('rewrite')) && lower.includes('summary')) {
      updateStreamingMessage(bubble, '⏳ Improving your summary...');
      const sumEl = document.getElementById('summary');
      const jobEl = document.getElementById('jobTitle');
      const improved = await callGroq(
        'You are a resume expert. Rewrite professional summaries to be impactful, ATS-optimized, and results-focused.',
        `Rewrite this summary for a ${jobEl?.value || 'professional'}. 3-4 sentences, strong action verbs, quantifiable results. Return only the improved text.\n\nCurrent: "${sumEl?.value || ''}"`,
        300
      );
      if (improved && sumEl) { sumEl.value = improved.trim(); sumEl.dispatchEvent(new Event('input')); if (typeof updatePreview === 'function') updatePreview(); }
      updateStreamingMessage(bubble, improved ? '✅ Summary updated in your resume!' : '❌ Could not improve summary.');

    } else if (lower.includes('cover letter')) {
      updateStreamingMessage(bubble, '⏳ Writing your cover letter...');
      const name = document.getElementById('fullName')?.value || '';
      const title = document.getElementById('jobTitle')?.value || '';
      const sum = document.getElementById('summary')?.value || '';
      const letter = await callGroq(
        'You are a professional cover letter writer.',
        `Write a cover letter for ${name}, a ${title}. Background: ${sum}. 3 paragraphs, 220 words, specific and confident.`,
        500
      );
      updateStreamingMessage(bubble, letter || '❌ Could not write cover letter.');

    } else if (lower.includes('analyze') || lower.includes('ats') || lower.includes('feedback') || lower.includes('tip')) {
      updateStreamingMessage(bubble, '⏳ Analyzing your resume...');
      const preview = document.querySelector('.preview-content');
      const resumeText = (preview?.innerText || '').slice(0, 2500) || 'No resume content.';
      const analysis = await callGroq(
        'You are an ATS expert and resume coach.',
        `Give 5 specific actionable improvements for this resume. Be direct and practical.\n\n${resumeText}`,
        600
      );
      updateStreamingMessage(bubble, analysis || '❌ Could not analyze.');

    } else {
      const answer = await callGroq(
        'You are a professional resume and career expert. Give helpful, concise advice.',
        text, 500
      );
      updateStreamingMessage(bubble, answer || '❌ No response.');
    }

    updateAIStatus(true);
  } catch(err) {
    updateStreamingMessage(bubble, `❌ ${err.message}`);
    updateAIStatus(false);
  } finally {
    if (sendBtn) sendBtn.disabled = false;
  }
}

// ── Quick actions ─────────────────────────────────────────────────
window.aiQuickAction = function(type) {
  const input = document.getElementById('aiInput');
  if (!input) return;
  const actions = {
    fill:    'Fill my entire resume. I am a [describe your role, years of experience, company, skills]',
    cover:   'Write me a professional cover letter',
    analyze: 'Analyze my resume and give me top ATS improvement tips',
    improve: 'Improve and rewrite my professional summary'
  };
  input.value = actions[type] || '';
  input.focus();
};

// ── Toggle panel ──────────────────────────────────────────────────
window.toggleAIPanel = function() {
  const panel = document.getElementById('aiPanel');
  const fab = document.getElementById('aiFab');
  if (!panel) return;
  const open = panel.classList.toggle('open');
  if (fab) fab.classList.toggle('panel-open', open);
  if (open) updateAIStatus(true);
};

// ── Keyboard shortcut ─────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'j') { e.preventDefault(); window.toggleAIPanel(); }
});

// ── Init ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => updateAIStatus(true));
