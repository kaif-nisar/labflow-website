// LabFlow AI Copilot Client-Side Script
(function () {
  let copilotHistory = [];
  let currentProposal = null;
  let attachedImages = [];

  const chatStream = document.getElementById("copilotChatStream");
  const chatForm = document.getElementById("copilotChatForm");
  const inputEl = document.getElementById("copilotInput");
  const sendBtn = document.getElementById("btnCopilotSend");
  const resetBtn = document.getElementById("btnClearCopilotChat");
  const micBtn = document.getElementById("btnCopilotMic");
  const attachBtn = document.getElementById("btnCopilotAttach");
  const fileInput = document.getElementById("copilotFileInput");
  const previewBar = document.getElementById("copilotAttachedImagesBar");

  // Auto-resize textarea
  if (inputEl) {
    inputEl.addEventListener("input", function () {
      this.style.height = "auto";
      this.style.height = Math.min(this.scrollHeight, 120) + "px";
    });

    inputEl.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        chatForm.dispatchEvent(new Event("submit"));
      }
    });

    // Support pasting image directly from clipboard (Ctrl+V)
    inputEl.addEventListener("paste", function (e) {
      const items = e.clipboardData?.items || [];
      for (const item of items) {
        if (item.type && item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            processImageFile(file);
          }
        }
      }
    });
  }

  // Handle File Input and Attachments
  function processImageFile(file) {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = function (e) {
      attachedImages.push({
        name: file.name || "Lab Report Photo",
        mimeType: file.type,
        data: e.target.result
      });
      renderAttachedImages();
    };
    reader.readAsDataURL(file);
  }

  function renderAttachedImages() {
    if (!previewBar) return;
    if (attachedImages.length === 0) {
      previewBar.style.display = "none";
      previewBar.innerHTML = "";
      return;
    }
    previewBar.style.display = "flex";
    previewBar.innerHTML = attachedImages.map((img, idx) => `
      <div class="image-thumb-pill">
        <img src="${img.data}" alt="attachment" />
        <span>${escapeHtml(img.name)}</span>
        <i class="fa-solid fa-xmark image-thumb-remove" data-idx="${idx}" title="Remove image"></i>
      </div>
    `).join("");

    previewBar.querySelectorAll(".image-thumb-remove").forEach(btn => {
      btn.addEventListener("click", function () {
        const idx = Number(this.getAttribute("data-idx"));
        attachedImages.splice(idx, 1);
        renderAttachedImages();
      });
    });
  }

  if (attachBtn && fileInput) {
    attachBtn.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", function () {
      const files = Array.from(this.files || []);
      for (const file of files) {
        processImageFile(file);
      }
      this.value = "";
    });
  }

  // Continuous Speech-to-Text (Voice Recognition) - Robust Desktop & Mobile Support
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let isListening = false;
  let userWantsListening = false;
  let accumulatedTranscript = "";
  let restartTimeout = null;

  function stopListening() {
    userWantsListening = false;
    isListening = false;
    if (restartTimeout) clearTimeout(restartTimeout);
    if (micBtn) {
      micBtn.classList.remove("listening");
      micBtn.title = "Bolkar batane ke liye Mic par click karein";
    }
    if (inputEl) {
      inputEl.placeholder = "Bolkar batane ke liye Mic, photo ke liye Pin dabayein ya type karein...";
    }
    try {
      if (recognition) recognition.stop();
    } catch (e) {}
  }

  async function startListening() {
    if (!SpeechRecognition) {
      alert("Voice recognition is not supported in this browser. Please use Google Chrome or Microsoft Edge.");
      return;
    }

    userWantsListening = true;
    accumulatedTranscript = inputEl ? inputEl.value.trim() : "";

    // Safely check & request mic permission so mobile Chrome/Safari won't silently fail
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(t => t.stop());
      } catch (permErr) {
        console.warn("Microphone access denied or error:", permErr);
        userWantsListening = false;
        stopListening();
        alert("Microphone permission was denied. Please allow microphone access in your browser to speak.");
        return;
      }
    }

    try {
      if (recognition) {
        try { recognition.abort(); } catch (e) {}
      }
      initRecognition();
      recognition.start();
    } catch (err) {
      console.warn("Speech start error:", err);
    }
  }

  function initRecognition() {
    if (!SpeechRecognition) return;
    if (recognition) {
      try { recognition.abort(); } catch (e) {}
    }

    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "hi-IN"; // Hindi & Hinglish standard clinical input

    recognition.onstart = function () {
      isListening = true;
      if (micBtn) {
        micBtn.classList.add("listening");
        micBtn.title = "Listening... Bolna jaari rakhein (Click again to stop)";
      }
      if (inputEl) inputEl.placeholder = "Sun raha hoon... Boliye (Speak continuously)...";
    };

    recognition.onresult = function (event) {
      let interimTranscript = "";
      let finalChunk = "";
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const res = event.results[i];
        if (res.isFinal) {
          finalChunk += res[0].transcript + " ";
        } else {
          interimTranscript += res[0].transcript;
        }
      }

      if (finalChunk) {
        accumulatedTranscript = (accumulatedTranscript + " " + finalChunk).replace(/\s+/g, " ").trim();
      }

      const currentDisplay = (accumulatedTranscript + (interimTranscript ? " " + interimTranscript : "")).replace(/\s+/g, " ").trim();
      if (inputEl) {
        inputEl.value = currentDisplay;
        inputEl.dispatchEvent(new Event("input"));
        inputEl.style.height = "auto";
        inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + "px";
      }
    };

    recognition.onerror = function (event) {
      console.warn("Speech recognition error:", event.error);
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        userWantsListening = false;
        stopListening();
        alert("Microphone permission was denied or not allowed by browser.");
      }
      // 'no-speech' is normal when user takes a breath, do not stop permanently
    };

    recognition.onend = function () {
      isListening = false;
      if (userWantsListening) {
        // Debounce restart gracefully for mobile
        if (restartTimeout) clearTimeout(restartTimeout);
        restartTimeout = setTimeout(() => {
          if (userWantsListening) {
            try {
              recognition.start();
            } catch (err) {
              console.warn("Restart recognition retry:", err);
            }
          }
        }, 300);
      } else {
        stopListening();
      }
    };
  }

  if (micBtn) {
    if (SpeechRecognition) {
      micBtn.addEventListener("click", function () {
        if (userWantsListening || isListening) {
          stopListening();
        } else {
          startListening();
        }
      });
    } else {
      micBtn.title = "Voice recognition not supported in this browser (Use Chrome or Edge)";
      micBtn.style.opacity = "0.5";
    }
  }

  // Scroll to bottom
  function scrollToBottom() {
    if (chatStream) {
      chatStream.scrollTop = chatStream.scrollHeight;
    }
  }

  // Append user message bubble with optional images
  function appendUserMessage(text, images = []) {
    const msgDiv = document.createElement("div");
    msgDiv.className = "msg-user-row";

    let imagesHtml = "";
    if (images.length > 0) {
      imagesHtml = `
        <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 8px;">
          ${images.map(img => `<img src="${img.data}" alt="attachment" style="max-width: 140px; max-height: 140px; border-radius: 8px; object-fit: cover; border: 1px solid rgba(255,255,255,0.4);" />`).join("")}
        </div>
      `;
    }

    msgDiv.innerHTML = `
      <div class="msg-user-bubble">
        ${imagesHtml}
        ${text ? `<div>${escapeHtml(text)}</div>` : ''}
      </div>
      <div class="msg-user-avatar">You</div>
    `;
    chatStream.appendChild(msgDiv);
    scrollToBottom();
  }

  // Show typing indicator
  function showTypingIndicator() {
    const id = "copilotTypingIndicator";
    const existing = document.getElementById(id);
    if (existing) existing.remove();

    const indicator = document.createElement("div");
    indicator.id = id;
    indicator.className = "msg-ai-row";
    indicator.innerHTML = `
      <div class="msg-ai-avatar">
        <i class="fa-solid fa-brain"></i>
      </div>
      <div class="typing-box">
        <span>AI analyzing & researching...</span>
        <div class="dot"></div>
        <div class="dot"></div>
        <div class="dot"></div>
      </div>
    `;
    chatStream.appendChild(indicator);
    scrollToBottom();
  }

  function removeTypingIndicator() {
    const indicator = document.getElementById("copilotTypingIndicator");
    if (indicator) indicator.remove();
  }

  // Action Proposal Validation: Prevents rendering dummy or empty action cards
  function isValidActionProposal(action) {
    if (!action || !action.type || action.type === "NONE" || !action.data) return false;
    const { type, data } = action;

    if (type === "CREATE_TEST") {
      const name = String(data.Name || data.name || "").trim().toLowerCase();
      const params = Array.isArray(data.parameters) ? data.parameters : [];
      if (!name || name === "test" || name.length < 2 || params.length === 0) return false;
    }
    if (type === "CREATE_PANEL") {
      const name = String(data.name || data.panelName || "").trim().toLowerCase();
      const tests = Array.isArray(data.testNames) ? data.testNames : [];
      if (!name || name === "panel" || name.length < 2 || tests.length === 0) return false;
    }
    if (type === "CREATE_PACKAGE") {
      const pkgName = String(data.packageName || data.name || "").trim().toLowerCase();
      if (!pkgName || pkgName === "package" || pkgName.length < 2) return false;
    }
    if (type === "CREATE_BOOKING") {
      const pName = String(data.patientName || "").trim().toLowerCase();
      const items = Array.isArray(data.items) ? data.items : [];
      if (!pName || pName === "patient" || pName.length < 2 || items.length === 0) return false;
    }
    if (type === "BATCH_FIX_TESTS" || type === "AUDIT_TESTS") {
      if ((!data.fixes || data.fixes.length === 0) && !data.issuesFound && !data.totalAudited) return false;
    }
    return true;
  }

  // Append assistant message bubble with optional action card
  function appendAssistantResponse(messageText, action = null) {
    removeTypingIndicator();

    const row = document.createElement("div");
    row.className = "msg-ai-row";

    let actionCardHtml = "";
    if (action && action.type && action.type !== "NONE" && action.data && isValidActionProposal(action)) {
      currentProposal = { type: action.type, data: action.data };
      actionCardHtml = renderActionCard(action.type, action.summary || "Ready for Action", action.data);
    }

    row.innerHTML = `
      <div class="msg-ai-avatar">
        <i class="fa-solid fa-brain"></i>
      </div>
      <div class="msg-ai-content">
        <div class="msg-ai-bubble">
          <div>${formatMarkdown(messageText)}</div>
        </div>
        ${actionCardHtml}
        <span class="msg-time">AI Copilot • ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
    `;

    chatStream.appendChild(row);
    scrollToBottom();
    bindCardEvents(row, action);
  }

  // Render Action Cards
  function renderActionCard(type, summary, data) {
    if (type === "CREATE_TEST") {
      const params = data.parameters || [];
      const rows = params.map((p, i) => {
        const nv = p.NormalValue?.[0] || {};
        const range = (nv.lowerValue || nv.upperValue)
          ? `${nv.lowerValue || 0} - ${nv.upperValue || ''} ${p.unit || ''}`
          : 'Qualitative / As per kit';
        return `
          <tr>
            <td style="font-weight: 700; color: #0f172a;">${i + 1}. ${escapeHtml(p.Para_name || '')}</td>
            <td style="color: #475569;">${escapeHtml(p.unit || '-')}</td>
            <td class="range-highlight">${escapeHtml(range)}</td>
          </tr>
        `;
      }).join("");

      return `
        <div class="copilot-action-card">
          <div class="card-top-bar">
            <div style="display: flex; align-items: center; gap: 10px;">
              <span class="card-badge badge-test"><i class="fa-solid fa-vial"></i> TEST PREVIEW</span>
              <h3 class="card-title">${escapeHtml(data.Name || 'Test')}</h3>
              ${data.Short_name ? `<span style="font-size: 11px; background: #e2e8f0; color: #334155; padding: 2px 6px; border-radius: 4px; font-family: monospace;">${escapeHtml(data.Short_name)}</span>` : ''}
            </div>
            <div class="card-price-box">
              <span class="card-price-label">Price</span>
              <div class="card-price-value">₹${escapeHtml(String(data.final_price || data.Price || 0))}</div>
            </div>
          </div>

          <div class="card-meta-grid">
            <div><span class="meta-item-label">Category:</span><span class="meta-item-val">${escapeHtml(data.categoryName || 'General')}</span></div>
            <div><span class="meta-item-label">Specimen:</span><span class="meta-item-val">${escapeHtml(data.sampleType || 'Serum')}</span></div>
            <div><span class="meta-item-label">Method:</span><span class="meta-item-val">${escapeHtml(data.method || 'Automated')}</span></div>
            <div><span class="meta-item-label">TAT:</span><span class="meta-item-val">${escapeHtml(data.tat || '24 Hours')}</span></div>
          </div>

          <div style="margin: 12px 0;">
            <div style="font-size: 12px; font-weight: 700; color: #334155; margin-bottom: 6px; text-transform: uppercase;">Parameters (${params.length}):</div>
            <div class="copilot-table-wrap">
              <table class="copilot-table">
                <thead>
                  <tr>
                    <th>Parameter Name</th>
                    <th>Unit</th>
                    <th>Reference Interval</th>
                  </tr>
                </thead>
                <tbody>${rows}</tbody>
              </table>
            </div>
          </div>

          ${data.interpretation ? `
            <div style="margin: 10px 0;">
              <details style="cursor: pointer;">
                <summary style="font-size: 12px; font-weight: 700; color: #2563eb;">View Clinical Interpretation</summary>
                <div class="interpretation-card">${data.interpretation}</div>
              </details>
            </div>
          ` : ''}

          <div class="card-footer">
            <span class="footer-hint"><i class="fa-solid fa-circle-info text-blue-500"></i> Edit karna hai to chat me bolein (e.g. "Price 500 kardo")</span>
            <button class="btn-copilot-save btn-copilot-confirm" data-action="CREATE_TEST">
              <i class="fa-solid fa-check"></i> Confirm & Save to Database
            </button>
          </div>
        </div>
      `;
    }

    if (type === "CREATE_PANEL") {
      const tests = (data.testNames || []).map(t => `<span style="padding: 4px 10px; background: #e0e7ff; color: #3730a3; border: 1px solid #c7d2fe; border-radius: 6px; font-size: 12px; font-weight: 600;">${escapeHtml(t)}</span>`).join(" ");
      return `
        <div class="copilot-action-card">
          <div class="card-top-bar">
            <div style="display: flex; align-items: center; gap: 10px;">
              <span class="card-badge badge-panel"><i class="fa-solid fa-layer-group"></i> PANEL PREVIEW</span>
              <h3 class="card-title">${escapeHtml(data.name || 'Panel')}</h3>
            </div>
            <div class="card-price-box">
              <span class="card-price-label">Panel Price</span>
              <div class="card-price-value">₹${escapeHtml(String(data.final_price || data.price || 0))}</div>
            </div>
          </div>

          <div class="card-meta-grid">
            <div><span class="meta-item-label">Category:</span><span class="meta-item-val">${escapeHtml(data.categoryName || 'Biochemistry')}</span></div>
            <div><span class="meta-item-label">Specimen:</span><span class="meta-item-val">${escapeHtml((data.sample_types || ['Serum']).join(', '))}</span></div>
          </div>

          <div style="margin: 12px 0;">
            <div style="font-size: 12px; font-weight: 700; color: #334155; margin-bottom: 8px;">Included Tests (${(data.testNames || []).length}):</div>
            <div style="display: flex; flex-wrap: gap: 6px;">${tests}</div>
          </div>

          <div class="card-footer">
            <span class="footer-hint"><i class="fa-solid fa-circle-info text-blue-500"></i> Click confirm to save panel</span>
            <button class="btn-copilot-save btn-copilot-confirm" data-action="CREATE_PANEL">
              <i class="fa-solid fa-check"></i> Confirm & Save Panel
            </button>
          </div>
        </div>
      `;
    }

    if (type === "CREATE_PACKAGE") {
      const tests = (data.testNames || []).map(t => `<span style="padding: 3px 8px; background: #f1f5f9; color: #334155; border-radius: 4px; font-size: 11px;">${escapeHtml(t)}</span>`).join(" ");
      const panels = (data.panelNames || []).map(p => `<span style="padding: 3px 8px; background: #e0e7ff; color: #3730a3; border-radius: 4px; font-size: 11px; font-weight: 600;">${escapeHtml(p)}</span>`).join(" ");

      return `
        <div class="copilot-action-card">
          <div class="card-top-bar">
            <div style="display: flex; align-items: center; gap: 10px;">
              <span class="card-badge badge-package"><i class="fa-solid fa-box-open"></i> PACKAGE PREVIEW</span>
              <h3 class="card-title">${escapeHtml(data.packageName || 'Package')}</h3>
            </div>
            <div class="card-price-box">
              <span class="card-price-label">Package Fee</span>
              <div class="card-price-value">₹${escapeHtml(String(data.final_price || data.packageFee || 0))}</div>
            </div>
          </div>

          <div style="margin: 12px 0;">
            ${panels ? `<div style="margin-bottom: 8px;"><strong style="font-size: 12px; color: #475569; display: block; margin-bottom: 4px;">Panels:</strong><div style="display: flex; flex-wrap: wrap; gap: 5px;">${panels}</div></div>` : ''}
            ${tests ? `<div><strong style="font-size: 12px; color: #475569; display: block; margin-bottom: 4px;">Individual Tests:</strong><div style="display: flex; flex-wrap: wrap; gap: 5px;">${tests}</div></div>` : ''}
          </div>

          <div class="card-footer">
            <span class="footer-hint"><i class="fa-solid fa-circle-info text-blue-500"></i> Click confirm to save package</span>
            <button class="btn-copilot-save btn-copilot-confirm" data-action="CREATE_PACKAGE">
              <i class="fa-solid fa-check"></i> Confirm & Save Package
            </button>
          </div>
        </div>
      `;
    }

    if (type === "CREATE_BOOKING") {
      const items = (data.items || []).map(it => `
        <li style="display: flex; justify-content: space-between; font-size: 13px; padding: 6px 0; border-bottom: 1px solid #f1f5f9;">
          <span style="font-weight: 600; color: #0f172a;">${escapeHtml(it.name || '')} (${escapeHtml(it.type || 'test')})</span>
          <span style="font-weight: 700; color: #059669;">₹${escapeHtml(String(it.estimatedPrice || 0))}</span>
        </li>
      `).join("");

      return `
        <div class="copilot-action-card">
          <div class="card-top-bar">
            <div style="display: flex; align-items: center; gap: 10px;">
              <span class="card-badge badge-booking"><i class="fa-solid fa-calendar-check"></i> BOOKING PREVIEW</span>
              <h3 class="card-title">${escapeHtml(data.patientName || 'Patient')}</h3>
              <span style="font-size: 12px; color: #64748b;">${escapeHtml(data.gender || 'Male')}, ${escapeHtml(String(data.year || ''))} Yrs</span>
            </div>
            <div class="card-price-box">
              <span class="card-price-label">Total Bill</span>
              <div class="card-price-value">₹${escapeHtml(String(data.total || 0))}</div>
            </div>
          </div>

          <div class="card-meta-grid">
            <div><span class="meta-item-label">Phone:</span><span class="meta-item-val">${escapeHtml(data.patientPhone || 'N/A')}</span></div>
            <div><span class="meta-item-label">Ref Doctor:</span><span class="meta-item-val">${escapeHtml(data.doctorName || 'Self')}</span></div>
          </div>

          <div style="margin: 10px 0;">
            <div style="font-size: 12px; font-weight: 700; color: #334155; margin-bottom: 6px;">Booked Items:</div>
            <ul style="list-style: none; padding: 0 10px; margin: 0; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">${items}</ul>
          </div>

          <div class="card-footer">
            <span class="footer-hint"><i class="fa-solid fa-circle-info text-blue-500"></i> Click confirm to create booking</span>
            <button class="btn-copilot-save btn-copilot-confirm" data-action="CREATE_BOOKING">
              <i class="fa-solid fa-check"></i> Confirm Patient Booking
            </button>
          </div>
        </div>
      `;
    }

    if (type === "AUDIT_TESTS" || type === "BATCH_FIX_TESTS") {
      const fixes = data.fixes || [];
      const fixesList = fixes.map((f, i) => {
        const issuesTags = (f.issues || []).map(iss => `
          <span style="display: inline-block; padding: 2px 8px; background: #fee2e2; color: #991b1b; border-radius: 4px; font-size: 11px; margin: 2px 4px 2px 0;">⚠️ ${escapeHtml(iss)}</span>
        `).join("");
        const proposedMethod = f.updates?.method || f.proposedMethod;
        const proposedInstrument = f.updates?.instrument || f.proposedInstrument;

        return `
          <div style="padding: 10px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-weight: 700; color: #0f172a; font-size: 13px;">${i + 1}. ${escapeHtml(f.currentName || f.testName || 'Test')}</span>
              ${f.proposedName && f.proposedName !== f.currentName ? `<span style="font-size: 11px; color: #059669; font-weight: 700;">➔ Standard: ${escapeHtml(f.proposedName)}</span>` : ''}
            </div>
            <div style="margin-top: 4px;">${issuesTags}</div>
            ${proposedMethod ? `<div style="font-size: 11px; color: #1e40af; margin-top: 4px; font-weight: 600;"><i class="fa-solid fa-flask"></i> Method: <span style="color:#0f172a; font-weight: 500;">${escapeHtml(proposedMethod)}</span></div>` : ''}
            ${proposedInstrument ? `<div style="font-size: 11px; color: #059669; margin-top: 2px; font-weight: 600;"><i class="fa-solid fa-microchip"></i> Analyzer: <span style="color:#0f172a; font-weight: 500;">${escapeHtml(proposedInstrument)}</span></div>` : ''}
            ${f.updates?.interpretation ? `<div style="font-size: 11px; color: #475569; margin-top: 4px;">✨ Proposed Clinical Interpretation: <em>Standard Pathology Text Ready</em></div>` : ''}
          </div>
        `;
      }).join("");

      return `
        <div class="copilot-action-card" style="border-color: #f59e0b;">
          <div class="card-top-bar">
            <div style="display: flex; align-items: center; gap: 10px;">
              <span class="card-badge" style="background: #fef3c7; color: #92400e;"><i class="fa-solid fa-stethoscope"></i> DATABASE AUDIT & FIX</span>
              <h3 class="card-title">Database Quality Check</h3>
            </div>
            <div class="card-price-box">
              <span class="card-price-label">Issues Found</span>
              <div class="card-price-value" style="color: #d97706;">${data.issuesFound ?? fixes.length}</div>
            </div>
          </div>

          <div style="margin: 10px 0;">
            <p style="font-size: 13px; color: #334155; margin-bottom: 10px;">
              Audit report: <strong>${data.totalAudited || fixes.length} tests</strong> examined. Following tests have missing fields or require standardization:
            </p>
            <div style="max-height: 280px; overflow-y: auto; padding-right: 4px;">
              ${fixes.length > 0 ? fixesList : '<div style="padding:12px; background:#ecfdf5; border:1px solid #a7f3d0; border-radius:8px; color:#065f46; font-weight:600;"><i class="fa-solid fa-circle-check"></i> Sabhi tests ke Method, Instrument, aur clinical details sahi tareeke se verified hain! Koi error nahi hai.</div>'}
            </div>
          </div>

          ${fixes.length > 0 ? `
            <div class="card-footer">
              <span class="footer-hint"><i class="fa-solid fa-shield-halved text-amber-500"></i> AI will update methods, analyzer instruments, and clinical standards in MongoDB</span>
              <button class="btn-copilot-save btn-copilot-confirm" data-action="BATCH_FIX_TESTS" style="background: #d97706;">
                <i class="fa-solid fa-wrench"></i> Auto-Fix All ${fixes.length} Tests in Database
              </button>
            </div>
          ` : ''}
        </div>
      `;
    }

    if (type === "UPDATE_PANEL" || type === "EDIT_PANEL") {
      const resolvedPanelTitle = data.panelName || data.name || data.panel || currentProposal?.data?.panelName || currentProposal?.data?.name || 'Panel Update';
      const toggleBadges = [];
      if (data.hideInterpretation !== undefined) {
        toggleBadges.push(data.hideInterpretation 
          ? `<span style="padding:4px 10px; background:#fef2f2; color:#991b1b; border:1px solid #fecaca; border-radius:6px; font-size:12px; font-weight:600;"><i class="fa-solid fa-eye-slash"></i> Individual Test Interpretations & Comments: <strong>HIDDEN</strong></span>`
          : `<span style="padding:4px 10px; background:#ecfdf5; color:#065f46; border:1px solid #a7f3d0; border-radius:6px; font-size:12px; font-weight:600;"><i class="fa-solid fa-eye"></i> Individual Test Interpretations & Comments: <strong>VISIBLE</strong></span>`
        );
      }
      if (data.hideMethodInstrument !== undefined) {
        toggleBadges.push(data.hideMethodInstrument
          ? `<span style="padding:4px 10px; background:#fef2f2; color:#991b1b; border:1px solid #fecaca; border-radius:6px; font-size:12px; font-weight:600;"><i class="fa-solid fa-eye-slash"></i> Sub-Test Method & Instrument: <strong>HIDDEN</strong></span>`
          : `<span style="padding:4px 10px; background:#ecfdf5; color:#065f46; border:1px solid #a7f3d0; border-radius:6px; font-size:12px; font-weight:600;"><i class="fa-solid fa-eye"></i> Sub-Test Method & Instrument: <strong>VISIBLE</strong></span>`
        );
      }
      if (data.hidePanelInterpretation !== undefined) {
        toggleBadges.push(data.hidePanelInterpretation
          ? `<span style="padding:4px 10px; background:#fef2f2; color:#991b1b; border:1px solid #fecaca; border-radius:6px; font-size:12px; font-weight:600;"><i class="fa-solid fa-eye-slash"></i> Panel Overall Interpretation: <strong>HIDDEN</strong></span>`
          : `<span style="padding:4px 10px; background:#ecfdf5; color:#065f46; border:1px solid #a7f3d0; border-radius:6px; font-size:12px; font-weight:600;"><i class="fa-solid fa-eye"></i> Panel Overall Interpretation: <strong>VISIBLE</strong></span>`
        );
      }

      return `
        <div class="copilot-action-card" style="border-color: #6366f1;">
          <div class="card-top-bar">
            <div style="display: flex; align-items: center; gap: 10px;">
              <span class="card-badge" style="background:#e0e7ff; color:#4338ca;"><i class="fa-solid fa-pen-to-square"></i> UPDATE PANEL</span>
              <h3 class="card-title">${escapeHtml(resolvedPanelTitle)}</h3>
            </div>
            ${data.final_price || data.price ? `
            <div class="card-price-box">
              <span class="card-price-label">Price</span>
              <div class="card-price-value">₹${escapeHtml(String(data.final_price || data.price))}</div>
            </div>` : ''}
          </div>

          <div style="margin: 12px 0;">
            <div style="font-size: 12px; font-weight: 700; color: #334155; margin-bottom: 8px;">Settings & Toggles to Apply:</div>
            <div style="display: flex; flex-direction: column; gap: 6px;">
              ${toggleBadges.length > 0 ? toggleBadges.join("") : '<span style="font-size:12px; color:#64748b;">Panel details update</span>'}
            </div>
          </div>

          <div class="card-footer">
            <span class="footer-hint"><i class="fa-solid fa-sliders text-indigo-500"></i> Click confirm to apply settings</span>
            <button class="btn-copilot-save btn-copilot-confirm" data-action="UPDATE_PANEL" style="background:#4f46e5;">
              <i class="fa-solid fa-check"></i> Confirm & Update Panel
            </button>
          </div>
        </div>
      `;
    }

    if (type === "UPDATE_TEST" || type === "EDIT_TEST") {
      const toggleBadges = [];
      if (data.hideInterpretation !== undefined) {
        toggleBadges.push(data.hideInterpretation 
          ? `<span style="padding:4px 10px; background:#fef2f2; color:#991b1b; border:1px solid #fecaca; border-radius:6px; font-size:12px; font-weight:600;"><i class="fa-solid fa-eye-slash"></i> Test Interpretation & Notes: <strong>HIDDEN</strong></span>`
          : `<span style="padding:4px 10px; background:#ecfdf5; color:#065f46; border:1px solid #a7f3d0; border-radius:6px; font-size:12px; font-weight:600;"><i class="fa-solid fa-eye"></i> Test Interpretation & Notes: <strong>VISIBLE</strong></span>`
        );
      }
      if (data.hideMethodInstrument !== undefined) {
        toggleBadges.push(data.hideMethodInstrument
          ? `<span style="padding:4px 10px; background:#fef2f2; color:#991b1b; border:1px solid #fecaca; border-radius:6px; font-size:12px; font-weight:600;"><i class="fa-solid fa-eye-slash"></i> Method & Instrument: <strong>HIDDEN</strong></span>`
          : `<span style="padding:4px 10px; background:#ecfdf5; color:#065f46; border:1px solid #a7f3d0; border-radius:6px; font-size:12px; font-weight:600;"><i class="fa-solid fa-eye"></i> Method & Instrument: <strong>VISIBLE</strong></span>`
        );
      }

      return `
        <div class="copilot-action-card" style="border-color: #0284c7;">
          <div class="card-top-bar">
            <div style="display: flex; align-items: center; gap: 10px;">
              <span class="card-badge" style="background:#e0f2fe; color:#0369a1;"><i class="fa-solid fa-pen-to-square"></i> UPDATE TEST</span>
              <h3 class="card-title">${escapeHtml(data.testName || data.name || data.Name || 'Test Update')}</h3>
            </div>
            ${data.final_price || data.Price ? `
            <div class="card-price-box">
              <span class="card-price-label">Price</span>
              <div class="card-price-value">₹${escapeHtml(String(data.final_price || data.Price))}</div>
            </div>` : ''}
          </div>

          <div style="margin: 12px 0;">
            <div style="font-size: 12px; font-weight: 700; color: #334155; margin-bottom: 8px;">Settings & Toggles to Apply:</div>
            <div style="display: flex; flex-direction: column; gap: 6px;">
              ${toggleBadges.length > 0 ? toggleBadges.join("") : '<span style="font-size:12px; color:#64748b;">Test fields update</span>'}
            </div>
          </div>

          <div class="card-footer">
            <span class="footer-hint"><i class="fa-solid fa-sliders text-sky-500"></i> Click confirm to apply settings</span>
            <button class="btn-copilot-save btn-copilot-confirm" data-action="UPDATE_TEST" style="background:#0284c7;">
              <i class="fa-solid fa-check"></i> Confirm & Update Test
            </button>
          </div>
        </div>
      `;
    }

    if (type === "UPDATE_PACKAGE" || type === "EDIT_PACKAGE") {
      return `
        <div class="copilot-action-card" style="border-color: #8b5cf6;">
          <div class="card-top-bar">
            <div style="display: flex; align-items: center; gap: 10px;">
              <span class="card-badge" style="background:#ede9fe; color:#6d28d9;"><i class="fa-solid fa-pen-to-square"></i> UPDATE PACKAGE</span>
              <h3 class="card-title">${escapeHtml(data.packageName || data.name || 'Package Update')}</h3>
            </div>
            ${data.final_price || data.packageFee ? `
            <div class="card-price-box">
              <span class="card-price-label">Price</span>
              <div class="card-price-value">₹${escapeHtml(String(data.final_price || data.packageFee))}</div>
            </div>` : ''}
          </div>

          <div class="card-footer">
            <span class="footer-hint"><i class="fa-solid fa-sliders text-purple-500"></i> Click confirm to update package</span>
            <button class="btn-copilot-save btn-copilot-confirm" data-action="UPDATE_PACKAGE" style="background:#7c3aed;">
              <i class="fa-solid fa-check"></i> Confirm & Update Package
            </button>
          </div>
        </div>
      `;
    }

    return "";
  }

  // Bind Confirm Buttons inside rendered card
  function bindCardEvents(container, action) {
    const confirmBtn = container.querySelector(".btn-copilot-confirm");
    if (!confirmBtn) return;

    confirmBtn.addEventListener("click", async function () {
      this.disabled = true;
      const originalHtml = this.innerHTML;
      this.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Applying Changes...`;

      try {
        const payloadData = { ...(action.data || {}) };
        if (action.summary && !payloadData.summary) {
          payloadData.summary = action.summary;
        }

        // Auto-merge target name from currentProposal if missing
        if (action.type === "UPDATE_PANEL" || action.type === "EDIT_PANEL") {
          if (!payloadData.panelName && !payloadData.name && !payloadData.panel) {
            payloadData.panelName = currentProposal?.data?.panelName || currentProposal?.data?.name || currentProposal?.data?.panel;
          }
        } else if (action.type === "UPDATE_TEST" || action.type === "EDIT_TEST") {
          if (!payloadData.testName && !payloadData.Name && !payloadData.name) {
            payloadData.testName = currentProposal?.data?.testName || currentProposal?.data?.Name || currentProposal?.data?.name;
          }
        } else if (action.type === "UPDATE_PACKAGE" || action.type === "EDIT_PACKAGE") {
          if (!payloadData.packageName && !payloadData.name) {
            payloadData.packageName = currentProposal?.data?.packageName || currentProposal?.data?.name;
          }
        }

        const res = await fetch("/api/v1/copilot/execute-action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            actionType: action.type,
            summary: action.summary,
            data: payloadData
          })
        });

        const respData = await res.json();
        if (respData.success) {
          this.className = "btn-copilot-save btn-copilot-saved";
          this.innerHTML = `<i class="fa-solid fa-circle-check"></i> Updated Successfully!`;
          currentProposal = null; // Clear proposal since it's committed

          if (action.type === "CREATE_BOOKING") {
            appendAssistantResponse(`✅ **Success:** ${respData.message}\n\n<button type="button" onclick="if(window.loadPage) window.loadPage('allcases')" style="display:inline-flex; align-items:center; gap:8px; margin-top:8px; padding:8px 16px; background:#2563eb; color:#ffffff; font-weight:600; font-size:13px; border:none; border-radius:6px; cursor:pointer; box-shadow: 0 2px 4px rgba(37,99,235,0.2);"><i class="fa-solid fa-folder-open"></i> Go to Cases Page (केस देखें)</button>`);
          } else {
            appendAssistantResponse(`✅ **Success:** ${respData.message}`);
          }
        } else {
          this.disabled = false;
          this.innerHTML = originalHtml;
          alert("Error: " + (respData.message || "Failed to execute."));
        }
      } catch (err) {
        this.disabled = false;
        this.innerHTML = originalHtml;
        alert("Network Error: " + err.message);
      }
    });
  }

  // Form Submit Handler
  if (chatForm) {
    chatForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      stopListening();
      const text = inputEl.value.trim();
      const imagesToSend = [...attachedImages];

      if (!text && imagesToSend.length === 0) return;

      inputEl.value = "";
      inputEl.style.height = "38px";
      attachedImages = [];
      renderAttachedImages();
      sendBtn.disabled = true;

      appendUserMessage(text, imagesToSend);
      copilotHistory.push({
        role: "user",
        content: text ? text : "Analyzing attached lab report image..."
      });
      showTypingIndicator();

      try {
        const res = await fetch("/api/v1/copilot/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            history: copilotHistory,
            currentProposal: currentProposal,
            images: imagesToSend
          })
        });

        const data = await res.json();
        if (data.success) {
          copilotHistory.push({ role: "assistant", content: data.message });
          appendAssistantResponse(data.message, data.action);
        } else {
          appendAssistantResponse(`⚠️ Error: ${data.message || "Kuch dikkat aayi, kripya dobara try karein."}`);
        }
      } catch (err) {
        appendAssistantResponse(`⚠️ Network Error: Server se connect nahi ho paya (${err.message}).`);
      } finally {
        sendBtn.disabled = false;
        inputEl.focus();
      }
    });
  }

  // Quick Action Chips
  document.querySelectorAll(".copilot-chip").forEach(chip => {
    chip.addEventListener("click", function () {
      const prompt = this.getAttribute("data-prompt");
      if (prompt && inputEl) {
        inputEl.value = prompt;
        inputEl.dispatchEvent(new Event("input"));
        chatForm.dispatchEvent(new Event("submit"));
      }
    });
  });

  // Reset Chat
  if (resetBtn) {
    resetBtn.addEventListener("click", function () {
      if (confirm("Kya aap nayi chat shuru karna chahte hain?")) {
        copilotHistory = [];
        currentProposal = null;
        attachedImages = [];
        renderAttachedImages();
        chatStream.innerHTML = `
          <div class="msg-ai-row">
            <div class="msg-ai-avatar">
              <i class="fa-solid fa-brain"></i>
            </div>
            <div class="msg-ai-content">
              <div class="msg-ai-bubble">
                <p>Nayi chat shuru ho gayi hai! Aap test, panel, package, patient booking ya report image 📎 upload karke bata sakte hain. ✨</p>
              </div>
            </div>
          </div>
        `;
      }
    });
  }

  // Utilities
  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatMarkdown(text) {
    if (!text) return "";
    let formatted = escapeHtml(text);
    // Bold **text**
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, "<strong style='color:#0f172a;'>$1</strong>");
    // Italic *text*
    formatted = formatted.replace(/\*(.*?)\*/g, "<em>$1</em>");
    // Code `code`
    formatted = formatted.replace(/`(.*?)`/g, "<code style='background: #e2e8f0; color: #1e40af; padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 12px;'>$1</code>");
    // Newlines to <br>
    formatted = formatted.replace(/\n/g, "<br>");
    return formatted;
  }

  // Viewport Auto-Fitting: Glues the input section directly in the viewport on desktop and mobile
  function fitCopilotToViewport() {
    const app = document.getElementById("ai-copilot-app");
    if (!app) return;
    const isMobile = window.innerWidth <= 768;
    const vh = (window.visualViewport && window.visualViewport.height) ? window.visualViewport.height : window.innerHeight;
    const rect = app.getBoundingClientRect();
    const bottomPadding = isMobile ? 6 : 14;
    const availableHeight = vh - rect.top - bottomPadding;
    if (availableHeight > 260) {
      app.style.height = availableHeight + "px";
      app.style.maxHeight = availableHeight + "px";
    }
    const contentBox = document.getElementById("content-box");
    if (contentBox) contentBox.scrollTop = 0;
  }
  fitCopilotToViewport();
  window.addEventListener("resize", fitCopilotToViewport);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", fitCopilotToViewport);
    window.visualViewport.addEventListener("scroll", fitCopilotToViewport);
  }
  setTimeout(fitCopilotToViewport, 150);
  setTimeout(fitCopilotToViewport, 500);
})();
