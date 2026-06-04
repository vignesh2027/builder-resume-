/**
 * CMR AI Module — Groq (llama-3.1-8b-instant)
 * 14,400 req/day free — per-device limit: 500/day
 */

const GROQ_BASE = 'https://api.groq.com/openai/v1';
const GROQ_MODEL = 'llama-3.1-8b-instant';
const _k = (p=>atob(p.join('')))(['Z3NrX','3BuOFh','tVVl5VF','M2VldrW','EF1QUpx','V0dkeWI','zRllKOT','B3MXc2M','2lFd3BY','d3J5cmV','Yb3dtblA=']);
const DEVICE_DAILY_LIMIT = 500;

// ── Rate limiter ──────────────────────────────────────────────────
function getRateData() {
  try {
    const d = JSON.parse(localStorage.getItem('cmr_rl') || '{}');
    if (d.date !== new Date().toDateString()) return { date: new Date().toDateString(), count: 0 };
    return d;
  } catch { return { date: new Date().toDateString(), count: 0 }; }
}
function bumpRate() {
  const d = getRateData(); d.count++;
  localStorage.setItem('cmr_rl', JSON.stringify(d));
}
function getRemainingToday() { return Math.max(0, DEVICE_DAILY_LIMIT - getRateData().count); }

// ── Status ────────────────────────────────────────────────────────
function updateAIStatus(ready) {
  const dot = document.getElementById('aiStatusDot');
  const label = document.getElementById('aiStatusLabel');
  if (dot) dot.style.background = ready ? '#22c55e' : '#f59e0b';
  const rem = getRemainingToday();
  // Only show limit if less than 20 remaining
  if (label) label.textContent = ready ? (rem < 20 ? `AI Ready · ${rem} left` : 'AI Ready') : 'AI Unavailable';
}

// ── Core Groq call ────────────────────────────────────────────────
async function callGroq(systemPrompt, userPrompt, maxTokens) {
  if (getRemainingToday() <= 0) throw new Error('Daily limit reached. Resets at midnight.');
  bumpRate();
  const res = await fetch(`${GROQ_BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${_k}` },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
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

// ── Apply AI resume to ALL form fields (with correct selectors) ───
function applyAIResume(jsonStr) {
  let data;
  try {
    const clean = jsonStr.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim();
    const match = clean.match(/\{[\s\S]*\}/);
    data = JSON.parse(match ? match[0] : clean);
  } catch(e) { console.error('JSON parse failed:', e, jsonStr.slice(0,200)); return false; }

  // Helper to set a field and fire input event
  function set(id, val) {
    if (!val) return;
    const el = document.getElementById(id);
    if (el) { el.value = String(val); el.dispatchEvent(new Event('input', { bubbles: true })); }
  }

  // ─ Personal info ─
  set('fullName', data.name || data.fullName);
  set('jobTitle', data.jobTitle || data.title);
  set('email', data.email);
  set('phone', data.phone);
  set('location', data.location);
  set('linkedin', data.linkedin);
  set('summary', data.summary);

  // ─ Skills (exact IDs from script.js) ─
  if (data.technicalSkills || data.skills) {
    const techSkills = data.technicalSkills || (Array.isArray(data.skills) ? data.skills.join(', ') : data.skills);
    set('technicalSkills', techSkills);
  }
  if (data.softSkills) set('softSkills', data.softSkills);

  // ─ Languages ─
  if (data.languages) {
    const lang = Array.isArray(data.languages) ? data.languages.join(', ') : data.languages;
    set('languages', lang);
  }

  // ─ Additional fields ─
  if (data.certifications) {
    const certs = Array.isArray(data.certifications) ? data.certifications.join('\n') : data.certifications;
    set('certifications', certs);
  }
  if (data.projects) {
    const proj = Array.isArray(data.projects) ? data.projects.join('\n') : data.projects;
    set('projects', proj);
  }
  if (data.awards) {
    const aw = Array.isArray(data.awards) ? data.awards.join('\n') : data.awards;
    set('awards', aw);
  }

  // ─ Experience (uses addExperience function from script.js) ─
  if (Array.isArray(data.experience) && data.experience.length > 0 && typeof addExperience === 'function') {
    const list = document.getElementById('experienceList');
    if (list) {
      list.innerHTML = '';
      data.experience.forEach(exp => {
        addExperience({
          title: exp.title || exp.jobTitle || '',
          company: exp.company || '',
          startDate: exp.startDate || '',
          endDate: exp.endDate || '',
          description: exp.description || exp.responsibilities || ''
        });
      });
    }
  }

  // ─ Education (uses addEducation from script.js) ─
  if (Array.isArray(data.education) && data.education.length > 0 && typeof addEducation === 'function') {
    const list = document.getElementById('educationList');
    if (list) {
      list.innerHTML = '';
      data.education.forEach(edu => {
        addEducation({
          degree: edu.degree || edu.course || '',
          school: edu.school || edu.institution || '',
          year: edu.year || edu.endDate || edu.graduationYear || ''
        });
      });
    }
  }

  // ─ Trigger full preview update ─
  setTimeout(() => { if (typeof updatePreview === 'function') updatePreview(); }, 100);
  return true;
}

// ── Resume generation prompt ──────────────────────────────────────
async function generateResumeFromAI(description, onChunk) {
  const system = `You are an expert resume writer. Generate complete, ATS-optimized resumes as pure JSON. No markdown, no explanation.`;
  const user = `Create a complete professional resume for this person: ${description}

Return ONLY this exact JSON structure with all fields filled:
{
  "name": "Full Name",
  "jobTitle": "Professional Title",
  "email": "email@example.com",
  "phone": "+91 99999 99999",
  "location": "City, State, Country",
  "linkedin": "linkedin.com/in/username",
  "summary": "Write a powerful 3-4 sentence professional summary with quantifiable achievements and strong action verbs",
  "technicalSkills": "Skill1, Skill2, Skill3, Skill4, Skill5, Skill6, Skill7, Skill8",
  "softSkills": "Communication, Leadership, Problem-solving, Team collaboration",
  "experience": [
    {
      "title": "Job Title",
      "company": "Company Name",
      "startDate": "2020-06",
      "endDate": "2023-12",
      "description": "• Led development of X resulting in 30% improvement\\n• Managed team of 5 engineers\\n• Delivered Y on time and 15% under budget"
    }
  ],
  "education": [
    {
      "degree": "B.Tech Computer Science",
      "school": "University Name",
      "year": "2020"
    }
  ],
  "projects": "Project Name — Brief description with tech used and outcome\nProject 2 — Description",
  "certifications": "AWS Solutions Architect — Amazon, 2023\nGoogle Cloud Professional",
  "awards": "Employee of the Year 2022 — Company Name",
  "languages": "English (Fluent), Hindi (Native)"
}

Make it realistic, professional, and ATS-friendly. Fill in realistic details based on the description.`;

  const result = await callGroq(system, user, 2500);
  if (onChunk) onChunk(result);
  return result;
}

// ── Cover letter ──────────────────────────────────────────────────
async function generateAICover(data, onChunk) {
  const system = 'You are a professional cover letter writer.';
  const user = `Write a professional cover letter for ${data.name || 'the applicant'} applying as ${data.jobTitle || 'a professional'}. Background: ${data.summary || ''}. 3 paragraphs, 220 words, strong opening, specific achievements, confident close.`;
  const result = await callGroq(system, user, 512);
  if (onChunk) onChunk(result);
  return result;
}

// ── Chat message helpers ──────────────────────────────────────────
function addMessageToChat(role, content) {
  const msgs = document.getElementById('aiMessages');
  if (!msgs) return null;
  const div = document.createElement('div');
  div.className = `ai-msg ai-msg-${role}`;
  div.textContent = content;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
  return div;
}
function updateStreamingMessage(div, text) {
  if (!div) return;
  div.textContent = text;
  const m = document.getElementById('aiMessages');
  if (m) m.scrollTop = m.scrollHeight;
}

// ── Main send ─────────────────────────────────────────────────────
async function sendAIMessage() {
  const input = document.getElementById('aiInput');
  const sendBtn = document.getElementById('aiSendBtn');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;

  input.value = '';
  addMessageToChat('user', text);
  if (sendBtn) sendBtn.disabled = true;
  const bubble = addMessageToChat('bot', '⏳ Working...');

  try {
    const lower = text.toLowerCase();

    if (lower.includes('i am') || lower.includes("i'm") || lower.includes('fill') ||
        lower.includes('generate') || lower.includes('create') || lower.includes('i have') ||
        lower.includes('my background') || lower.includes('years of experience')) {
      updateStreamingMessage(bubble, '⏳ Generating your complete resume...');
      const json = await generateResumeFromAI(text);
      if (!json) throw new Error('No response from AI');
      const ok = applyAIResume(json);
      updateStreamingMessage(bubble, ok
        ? '✅ Done! Your entire resume has been filled — name, summary, experience, education, skills, and more. Review the preview and edit anything you want.'
        : '⚠️ AI generated a resume but had trouble parsing it. Try being more specific:\n"I am a software engineer with 5 years at TCS, B.Tech CS from VIT 2020, skilled in Java, React, Python"');

    } else if ((lower.includes('improve') || lower.includes('rewrite')) && lower.includes('summary')) {
      updateStreamingMessage(bubble, '⏳ Rewriting your summary...');
      const sumEl = document.getElementById('summary');
      const jobEl = document.getElementById('jobTitle');
      const improved = await callGroq(
        'You are a resume expert. Rewrite summaries to be powerful, ATS-optimized, and results-focused.',
        `Rewrite this professional summary for a ${jobEl?.value || 'professional'}. Make it 3-4 sentences, strong action verbs, quantifiable results. Return only the improved text.\n\nCurrent: "${sumEl?.value || 'No summary yet.'}"`,
        300
      );
      if (improved && sumEl) {
        sumEl.value = improved.trim();
        sumEl.dispatchEvent(new Event('input', { bubbles: true }));
        setTimeout(() => { if (typeof updatePreview === 'function') updatePreview(); }, 100);
      }
      updateStreamingMessage(bubble, improved ? `✅ Summary updated!\n\n"${improved.trim().slice(0,120)}..."` : '❌ Could not improve summary.');

    } else if (lower.includes('cover letter')) {
      updateStreamingMessage(bubble, '⏳ Writing your cover letter...');
      const name = document.getElementById('fullName')?.value || '';
      const title = document.getElementById('jobTitle')?.value || '';
      const sum = document.getElementById('summary')?.value || '';
      const letter = await callGroq('You are a professional cover letter writer.',
        `Write a professional cover letter. Name: ${name}. Title: ${title}. Background: ${sum}. 3 paragraphs, 220 words, specific and confident.`, 500);
      updateStreamingMessage(bubble, letter || '❌ Could not write cover letter.');

    } else if (lower.includes('analyze') || lower.includes('ats') || lower.includes('feedback') || lower.includes('score')) {
      updateStreamingMessage(bubble, '⏳ Analyzing your resume...');
      const preview = document.querySelector('.preview-content');
      const resumeText = (preview?.innerText || '').slice(0, 2500) || 'No resume content yet.';
      const analysis = await callGroq(
        'You are a strict ATS expert and resume coach.',
        `Analyze this resume and give 6 specific actionable improvements. Be direct and practical. Number each one.\n\n${resumeText}`, 600
      );
      updateStreamingMessage(bubble, analysis || '❌ Could not analyze.');

    } else if (lower.includes('improve experience') || lower.includes('better experience')) {
      updateStreamingMessage(bubble, '⏳ Improving your experience bullets...');
      const preview = document.querySelector('.preview-content');
      const expText = preview?.querySelector('#previewExperience')?.innerText || '';
      const improved = await callGroq(
        'You are a resume expert. Rewrite experience bullet points to be more impactful with strong action verbs and quantifiable results.',
        `Rewrite these experience descriptions with stronger action verbs and measurable achievements. Return just the improved bullet points.\n\n${expText.slice(0,1000)}`, 600
      );
      updateStreamingMessage(bubble, improved || '❌ Could not improve experience.');

    } else {
      updateStreamingMessage(bubble, '⏳ Thinking...');
      const answer = await callGroq(
        'You are a professional resume and career expert. Give helpful, concise career advice.',
        text, 500
      );
      updateStreamingMessage(bubble, answer || '❌ No response received.');
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
    fill:    'Fill my entire resume. I am a [describe your role, years of experience, company, education, and key skills]',
    cover:   'Write me a professional cover letter based on my resume',
    analyze: 'Analyze my resume and give me top 6 ATS improvement tips with specific changes',
    improve: 'Improve and rewrite my professional summary to be more impactful'
  };
  input.value = actions[type] || '';
  input.focus();
};

// ── Panel toggle ──────────────────────────────────────────────────
window.toggleAIPanel = function() {
  const panel = document.getElementById('aiPanel');
  const fab = document.getElementById('aiFab');
  if (!panel) return;
  const open = panel.classList.toggle('open');
  if (fab) fab.classList.toggle('panel-open', open);
  if (open) updateAIStatus(true);
};

document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'j') { e.preventDefault(); window.toggleAIPanel(); }
});

document.addEventListener('DOMContentLoaded', () => updateAIStatus(true));
