/* Awwfy Studios - Treasure Island Interactive Book Reader */

(function () {
  'use strict';

  const STORAGE_KEY = 'awwfy-treasure-island-progress';

  // App State
  const state = {
    screen: 'start', // 'start' | 'menu' | 'chapter' | 'loading' | 'error'
    errorMessage: '',
    currentChapterId: '00',
    currentStep: 'story', // 'story' | 'words' | 'order' | 'quiz' | 'sayIt'
    currentPage: 0,
    isOriginalOpen: false,
    order: {
      shuffled: [],
      selected: [],
      checked: false,
      isCorrect: false
    },
    quiz: {
      questionIndex: 0,
      answered: false,
      selectedOption: null,
      hintVisible: false,
      isFinished: false
    },
    speech: {
      speakingIndex: -1,
      isSpeaking: false
    }
  };

  // LocalStorage Helpers (wrapped in try/catch)
  function getProgress() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        return {
          readChapters: Array.isArray(parsed.readChapters) ? parsed.readChapters : [],
          lastChapter: parsed.lastChapter || null
        };
      }
    } catch (e) {
      console.warn('LocalStorage read failed:', e);
    }
    return { readChapters: [], lastChapter: null };
  }

  function saveProgress(readChapters, lastChapter) {
    try {
      const payload = {
        readChapters: readChapters || [],
        lastChapter: lastChapter || null
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
      console.warn('LocalStorage write failed:', e);
    }
  }

  function markChapterRead(chapterId) {
    const prog = getProgress();
    if (!prog.readChapters.includes(chapterId)) {
      prog.readChapters.push(chapterId);
    }
    prog.lastChapter = chapterId;
    saveProgress(prog.readChapters, prog.lastChapter);
  }

  // Speech Synthesis Helper
  function stopSpeech() {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    state.speech.isSpeaking = false;
    state.speech.speakingIndex = -1;
    document.querySelectorAll('.story-sentence.speaking').forEach(el => {
      el.classList.remove('speaking');
    });
    const audioBtn = document.getElementById('story-read-btn');
    if (audioBtn) {
      audioBtn.textContent = 'Read to me';
      audioBtn.classList.remove('btn-secondary');
      audioBtn.classList.add('btn-sunshine');
    }
  }

  function speakText(text, onEnd) {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-GB';
    utterance.rate = 0.9;
    if (onEnd) {
      utterance.onend = onEnd;
      utterance.onerror = onEnd;
    }
    window.speechSynthesis.speak(utterance);
  }

  function speakPageSentences(sentences, pageIndex) {
    if (!('speechSynthesis' in window)) return;
    stopSpeech();

    state.speech.isSpeaking = true;
    const audioBtn = document.getElementById('story-read-btn');
    if (audioBtn) {
      audioBtn.textContent = 'Stop';
      audioBtn.classList.remove('btn-sunshine');
      audioBtn.classList.add('btn-secondary');
    }

    let idx = 0;
    function readNext() {
      if (!state.speech.isSpeaking || idx >= sentences.length || state.currentPage !== pageIndex) {
        stopSpeech();
        return;
      }

      state.speech.speakingIndex = idx;
      document.querySelectorAll('.story-sentence').forEach((el, i) => {
        if (i === idx) {
          el.classList.add('speaking');
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else {
          el.classList.remove('speaking');
        }
      });

      const utterance = new SpeechSynthesisUtterance(sentences[idx]);
      utterance.lang = 'en-GB';
      utterance.rate = 0.9;
      utterance.onend = () => {
        idx++;
        readNext();
      };
      utterance.onerror = () => {
        stopSpeech();
      };
      window.speechSynthesis.speak(utterance);
    }

    readNext();
  }

  // Shuffle Helper (ensures result is never identical to correct order)
  function getShuffledEvents(events) {
    const arr = events.slice();
    if (arr.length <= 1) return arr;
    let shuffled;
    let isSame = true;
    let attempts = 0;
    while (isSame && attempts < 20) {
      shuffled = arr.slice();
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = shuffled[i];
        shuffled[i] = shuffled[j];
        shuffled[j] = temp;
      }
      isSame = shuffled.every((val, index) => val === events[index]);
      attempts++;
    }
    if (isSame) {
      // Swap first two if still same
      const temp = shuffled[0];
      shuffled[0] = shuffled[1];
      shuffled[1] = temp;
    }
    return shuffled;
  }

  // Navigation and Chapter Loading
  function openChapter(id) {
    stopSpeech();
    state.screen = 'loading';
    state.currentChapterId = id;
    state.currentStep = 'story';
    state.currentPage = 0;
    state.isOriginalOpen = false;
    render();

    // Check if chapter script already loaded
    if (window.AWWFY_CHAPTERS && window.AWWFY_CHAPTERS[id]) {
      setupChapterData(id);
      return;
    }

    // Load chapter script dynamically
    const script = document.createElement('script');
    script.src = 'js/chapters/ch' + id + '.js';
    script.onload = () => {
      if (window.AWWFY_CHAPTERS && window.AWWFY_CHAPTERS[id]) {
        setupChapterData(id);
      } else {
        showError('This chapter could not open. Please go back and try again.');
      }
    };
    script.onerror = () => {
      showError('This chapter could not open. Please go back and try again.');
    };
    document.body.appendChild(script);

    // Also load original chapter text if not present
    if (!window.AWWFY_ORIGINALS || !window.AWWFY_ORIGINALS[id]) {
      const origScript = document.createElement('script');
      origScript.src = 'js/originals/ch' + id + '.js';
      origScript.onload = () => {
        if (state.screen === 'chapter' && state.currentChapterId === id) {
          const btnSlot = document.getElementById('original-btn-slot');
          if (btnSlot) {
            btnSlot.innerHTML = '<button id="open-original-btn" class="btn btn-secondary btn-small" type="button">Real book</button>';
            const b = document.getElementById('open-original-btn');
            if (b) {
              b.onclick = () => {
                state.isOriginalOpen = true;
                renderOriginalModal();
              };
            }
          }
        }
      };
      document.body.appendChild(origScript);
    }
  }

  function setupChapterData(id) {
    const ch = window.AWWFY_CHAPTERS[id];
    state.order.shuffled = getShuffledEvents(ch.order);
    state.order.selected = [];
    state.order.checked = false;
    state.order.isCorrect = false;

    state.quiz.questionIndex = 0;
    state.quiz.answered = false;
    state.quiz.selectedOption = null;
    state.quiz.hintVisible = false;
    state.quiz.isFinished = false;

    // Save as last opened chapter
    const prog = getProgress();
    prog.lastChapter = id;
    saveProgress(prog.readChapters, prog.lastChapter);

    state.screen = 'chapter';
    render();
  }

  function showError(msg) {
    state.screen = 'error';
    state.errorMessage = msg;
    render();
  }

  // RENDER FUNCTIONS
  function render() {
    const app = document.getElementById('app');
    if (!app) return;

    if (state.screen === 'start') {
      renderStartScreen(app);
    } else if (state.screen === 'menu') {
      renderMenuScreen(app);
    } else if (state.screen === 'chapter') {
      renderChapterScreen(app);
    } else if (state.screen === 'loading') {
      renderLoadingScreen(app);
    } else if (state.screen === 'error') {
      renderErrorScreen(app);
    }
  }

  // 1. Start Screen
  function renderStartScreen(app) {
    const book = window.AWWFY_BOOK;
    const prog = getProgress();
    const hasHistory = prog.lastChapter !== null || prog.readChapters.length > 0;
    const continueChapter = prog.lastChapter || '00';
    const buttonText = hasHistory ? ('Continue: Chapter ' + continueChapter) : 'Start reading';

    app.innerHTML = `
      <div class="start-screen">
        <div class="cover-wrapper">
          <img class="cover-image" src="${book.cover.image}" alt="${book.cover.alt}">
          <div class="img-fallback hidden">
            <div class="img-fallback-label">Cover Picture</div>
            <div>${book.cover.alt}</div>
          </div>
        </div>

        <h1 class="start-title">${book.title}</h1>
        <p class="start-credit">Retold from ${book.title} by ${book.author} (${book.year}).</p>

        <div class="start-actions">
          <button id="start-btn" class="btn btn-primary" type="button">${buttonText}</button>
          <button id="menu-btn" class="btn btn-secondary" type="button">Chapter menu</button>
        </div>

        <div class="start-footer">
          <a href="https://awwfy.com" target="_blank" rel="noopener">Awwfy Studios</a>
        </div>
      </div>
    `;

    // Handle image fallback
    const img = app.querySelector('.cover-image');
    if (img) {
      img.onerror = function () {
        this.classList.add('hidden');
        if (this.nextElementSibling) {
          this.nextElementSibling.classList.remove('hidden');
        }
      };
    }

    document.getElementById('start-btn').onclick = () => {
      openChapter(continueChapter);
    };
    document.getElementById('menu-btn').onclick = () => {
      state.screen = 'menu';
      render();
    };
  }

  // 2. Menu Screen
  function renderMenuScreen(app) {
    const book = window.AWWFY_BOOK;
    const prog = getProgress();
    const readCount = prog.readChapters.length;
    const totalChapters = book.chapters.length;

    let rowsHtml = '';
    book.chapters.forEach(ch => {
      const isRead = prog.readChapters.includes(ch.id);
      let statusClass = 'status-soon';
      let statusText = 'Coming soon';
      let isClickable = false;

      if (isRead) {
        statusClass = 'status-read';
        statusText = 'Read';
        isClickable = true;
      } else if (ch.ready) {
        statusClass = 'status-start';
        statusText = 'Start';
        isClickable = true;
      }

      rowsHtml += `
        <li class="chapter-row ${isClickable ? 'clickable' : 'disabled'}" data-id="${ch.id}" tabindex="${isClickable ? '0' : '-1'}">
          <div class="chapter-row-info">
            <span class="chapter-number">${ch.id}</span>
            <span class="chapter-name">${ch.title}</span>
          </div>
          <span class="chapter-status ${statusClass}">${statusText}</span>
        </li>
      `;
    });

    app.innerHTML = `
      <div class="menu-screen">
        <header class="menu-header">
          <div class="menu-header-top">
            <h1 class="menu-title">Chapters</h1>
            <button id="back-to-start" class="btn btn-secondary btn-small" type="button">Cover</button>
          </div>
          <div class="menu-progress">${readCount} of ${totalChapters} chapters read</div>
        </header>

        <ul class="chapter-list">
          ${rowsHtml}
        </ul>
      </div>
    `;

    document.getElementById('back-to-start').onclick = () => {
      state.screen = 'start';
      render();
    };

    app.querySelectorAll('.chapter-row.clickable').forEach(row => {
      const id = row.getAttribute('data-id');
      row.onclick = () => openChapter(id);
      row.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openChapter(id);
        }
      };
    });
  }

  // 3. Chapter Screen
  function renderChapterScreen(app) {
    const ch = window.AWWFY_CHAPTERS[state.currentChapterId];
    if (!ch) {
      showError('Chapter data is missing.');
      return;
    }

    const hasOriginal = window.AWWFY_ORIGINALS && window.AWWFY_ORIGINALS[state.currentChapterId];

    app.innerHTML = `
      <div class="chapter-screen">
        <header class="chapter-top-bar">
          <button id="nav-menu-btn" class="btn btn-secondary btn-small" type="button">Menu</button>
          <div class="chapter-header-title">${ch.title}</div>
          <div id="original-btn-slot">
            ${hasOriginal ? '<button id="open-original-btn" class="btn btn-secondary btn-small" type="button">Real book</button>' : '<div style="width: 72px;"></div>'}
          </div>
        </header>

        <nav class="step-nav" aria-label="Chapter sections">
          <button class="step-pill ${state.currentStep === 'story' ? 'active' : ''}" data-step="story" type="button">Story</button>
          <button class="step-pill ${state.currentStep === 'words' ? 'active' : ''}" data-step="words" type="button">Words</button>
          <button class="step-pill ${state.currentStep === 'order' ? 'active' : ''}" data-step="order" type="button">Order</button>
          <button class="step-pill ${state.currentStep === 'quiz' ? 'active' : ''}" data-step="quiz" type="button">Quiz</button>
          <button class="step-pill ${state.currentStep === 'sayIt' ? 'active' : ''}" data-step="sayIt" type="button">Say it</button>
        </nav>

        <main class="step-content" id="step-content-area">
          <!-- Rendered by active step -->
        </main>

        <div id="original-modal-container"></div>
      </div>
    `;

    document.getElementById('nav-menu-btn').onclick = () => {
      stopSpeech();
      state.screen = 'menu';
      render();
    };

    const origBtn = document.getElementById('open-original-btn');
    if (origBtn) {
      origBtn.onclick = () => {
        state.isOriginalOpen = true;
        renderOriginalModal();
      };
    }

    app.querySelectorAll('.step-pill').forEach(btn => {
      btn.onclick = () => {
        stopSpeech();
        state.currentStep = btn.getAttribute('data-step');
        renderStepContent();
        updateStepPills();
      };
    });

    renderStepContent();
  }

  function updateStepPills() {
    document.querySelectorAll('.step-pill').forEach(pill => {
      const step = pill.getAttribute('data-step');
      if (step === state.currentStep) {
        pill.classList.add('active');
      } else {
        pill.classList.remove('active');
      }
    });
  }

  function renderStepContent() {
    const area = document.getElementById('step-content-area');
    if (!area) return;

    if (state.currentStep === 'story') {
      renderStoryStep(area);
    } else if (state.currentStep === 'words') {
      renderWordsStep(area);
    } else if (state.currentStep === 'order') {
      renderOrderStep(area);
    } else if (state.currentStep === 'quiz') {
      renderQuizStep(area);
    } else if (state.currentStep === 'sayIt') {
      renderSayItStep(area);
    }
  }

  // STEP: STORY
  function renderStoryStep(container) {
    const ch = window.AWWFY_CHAPTERS[state.currentChapterId];
    const page = ch.pages[state.currentPage];
    const totalPages = ch.pages.length;

    let sentencesHtml = '';
    page.text.forEach((sent, idx) => {
      sentencesHtml += `<span class="story-sentence" id="sentence-${idx}">${sent} </span>`;
    });

    let dotsHtml = '';
    for (let i = 0; i < totalPages; i++) {
      dotsHtml += `<div class="page-dot ${i === state.currentPage ? 'active' : ''}"></div>`;
    }

    const hasVoice = 'speechSynthesis' in window;
    const hasImage = typeof page.image === 'string' && page.image.trim().length > 0;

    container.innerHTML = `
      <div class="story-hook">${ch.hook}</div>

      <div class="story-card${hasImage ? '' : ' story-card--text-only'}" id="story-swipe-card">
        ${hasImage ? `
        <div class="story-media">
          <img class="story-image" src="${page.image}" alt="${page.alt || ''}">
        </div>
        ` : ''}

        <div class="story-text-box">
          ${sentencesHtml}
        </div>
      </div>

      <div class="story-controls">
        ${hasVoice ? `
          <div class="story-audio-bar">
            <button id="story-read-btn" class="btn btn-sunshine btn-small" type="button">Read to me</button>
          </div>
        ` : ''}

        <div class="story-page-nav">
          <button id="story-prev-btn" class="btn btn-secondary btn-small" type="button" ${state.currentPage === 0 ? 'disabled' : ''}>Back</button>
          <div class="page-dots">${dotsHtml}</div>
          <button id="story-next-btn" class="btn btn-primary btn-small" type="button">
            ${state.currentPage === totalPages - 1 ? 'Next: Words' : 'Next'}
          </button>
        </div>
      </div>
    `;

    // If a story image fails to load, collapse media so no grey box is shown
    const img = container.querySelector('.story-image');
    if (img) {
      img.onerror = function () {
        const media = this.closest('.story-media');
        const card = document.getElementById('story-swipe-card');
        if (media) media.remove();
        if (card) card.classList.add('story-card--text-only');
      };
    }

    // Audio button
    const audioBtn = document.getElementById('story-read-btn');
    if (audioBtn) {
      audioBtn.onclick = () => {
        if (state.speech.isSpeaking) {
          stopSpeech();
        } else {
          speakPageSentences(page.text, state.currentPage);
        }
      };
    }

    // Prev / Next Buttons
    const prevBtn = document.getElementById('story-prev-btn');
    if (prevBtn) {
      prevBtn.onclick = () => {
        if (state.currentPage > 0) {
          stopSpeech();
          state.currentPage--;
          renderStoryStep(container);
        }
      };
    }

    const nextBtn = document.getElementById('story-next-btn');
    if (nextBtn) {
      nextBtn.onclick = () => {
        stopSpeech();
        if (state.currentPage < totalPages - 1) {
          state.currentPage++;
          renderStoryStep(container);
        } else {
          state.currentStep = 'words';
          updateStepPills();
          renderStepContent();
        }
      };
    }

    // Swipe support for mobile
    const swipeCard = document.getElementById('story-swipe-card');
    if (swipeCard) {
      let touchStartX = 0;
      swipeCard.ontouchstart = (e) => {
        touchStartX = e.changedTouches[0].screenX;
      };
      swipeCard.ontouchend = (e) => {
        const touchEndX = e.changedTouches[0].screenX;
        const diff = touchEndX - touchStartX;
        if (diff < -50) {
          // Swipe left -> Next
          if (state.currentPage < totalPages - 1) {
            stopSpeech();
            state.currentPage++;
            renderStoryStep(container);
          }
        } else if (diff > 50) {
          // Swipe right -> Back
          if (state.currentPage > 0) {
            stopSpeech();
            state.currentPage--;
            renderStoryStep(container);
          }
        }
      };
    }
  }

  // STEP: WORDS
  function renderWordsStep(container) {
    const ch = window.AWWFY_CHAPTERS[state.currentChapterId];
    let cardsHtml = '';

    ch.words.forEach((w, idx) => {
      cardsHtml += `
        <div class="flip-card" data-idx="${idx}" tabindex="0" role="button" aria-label="Word card: ${w.word}">
          <div class="flip-card-inner">
            <div class="flip-card-front">
              <div>
                <div class="word-term">${w.word}</div>
                <div class="word-hint">Tap card to flip</div>
              </div>
              <button class="audio-btn word-speaker-btn" data-word="${w.word}" type="button" aria-label="Listen to ${w.word}">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                </svg>
              </button>
            </div>
            <div class="flip-card-back">
              <div class="word-meaning">${w.meaning}</div>
              <div class="word-example">${w.example}</div>
              <button class="audio-btn meaning-speaker-btn" data-text="${w.meaning}" type="button" aria-label="Listen to meaning">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      `;
    });

    container.innerHTML = `
      <div class="words-container">
        <p class="words-header">Tap a card to see what the word means.</p>
        ${cardsHtml}
        <div style="margin-top: 12px; display: flex; justify-content: flex-end;">
          <button id="words-next-btn" class="btn btn-primary" type="button">Next: Order</button>
        </div>
      </div>
    `;

    container.querySelectorAll('.flip-card').forEach(card => {
      card.onclick = (e) => {
        if (e.target.closest('.audio-btn')) return;
        card.classList.toggle('flipped');
      };
      card.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          if (e.target.closest('.audio-btn')) return;
          e.preventDefault();
          card.classList.toggle('flipped');
        }
      };
    });

    container.querySelectorAll('.word-speaker-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const word = btn.getAttribute('data-word');
        speakText(word);
      };
    });

    container.querySelectorAll('.meaning-speaker-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const text = btn.getAttribute('data-text');
        speakText(text);
      };
    });

    const nextBtn = document.getElementById('words-next-btn');
    if (nextBtn) {
      nextBtn.onclick = () => {
        state.currentStep = 'order';
        updateStepPills();
        renderStepContent();
      };
    }
  }

  // STEP: ORDER
  function renderOrderStep(container) {
    const ch = window.AWWFY_CHAPTERS[state.currentChapterId];
    const totalEvents = 4;
    const selected = state.order.selected;

    // Available events are those in shuffled that have not been selected yet
    const available = state.order.shuffled.filter(item => !selected.includes(item));

    let slotsHtml = '';
    for (let i = 0; i < totalEvents; i++) {
      const itemText = selected[i];
      if (itemText) {
        slotsHtml += `
          <div class="order-slot filled" data-slot="${i}" role="button" tabindex="0" title="Tap to remove">
            <span class="order-slot-num">${i + 1}.</span>
            <span class="order-slot-text">${itemText}</span>
          </div>
        `;
      } else {
        slotsHtml += `
          <div class="order-slot">
            <span class="order-slot-num">${i + 1}.</span>
            <span class="order-slot-text" style="color: var(--grey); font-weight: normal;">Tap an event below</span>
          </div>
        `;
      }
    }

    let poolHtml = '';
    available.forEach(ev => {
      poolHtml += `
        <button class="order-item-btn" data-event="${ev.replace(/"/g, '&quot;')}" type="button">
          ${ev}
        </button>
      `;
    });

    let feedbackHtml = '';
    if (state.order.checked) {
      if (state.order.isCorrect) {
        feedbackHtml = `
          <div class="order-feedback correct">
            Well done! That is the right order.
          </div>
          <div style="margin-top: 8px; display: flex; justify-content: flex-end;">
            <button id="order-to-quiz-btn" class="btn btn-primary" type="button">Next: Quiz</button>
          </div>
        `;
      } else {
        let correctCount = 0;
        selected.forEach((ev, idx) => {
          if (ev === ch.order[idx]) correctCount++;
        });
        feedbackHtml = `
          <div class="order-feedback incorrect">
            You have ${correctCount} of 4 in the right place. Take another look and try again.
          </div>
          <div style="margin-top: 8px; display: flex; gap: 12px; justify-content: flex-end;">
            <button id="order-reset-btn" class="btn btn-secondary" type="button">Try again</button>
          </div>
        `;
      }
    }

    container.innerHTML = `
      <div class="order-container">
        <div>
          <div class="order-section-title">Your Order:</div>
          <div class="order-slots">${slotsHtml}</div>
        </div>

        ${available.length > 0 ? `
          <div>
            <div class="order-section-title">Tap events in the order they happened:</div>
            <div class="order-pool">${poolHtml}</div>
          </div>
        ` : ''}

        ${feedbackHtml}

        ${!state.order.checked && selected.length === totalEvents ? `
          <div style="display: flex; justify-content: flex-end;">
            <button id="order-check-btn" class="btn btn-primary" type="button">Check order</button>
          </div>
        ` : ''}
      </div>
    `;

    // Tap on available event -> move to selected
    container.querySelectorAll('.order-item-btn').forEach(btn => {
      btn.onclick = () => {
        const ev = btn.getAttribute('data-event');
        state.order.selected.push(ev);
        state.order.checked = false;
        renderOrderStep(container);
      };
    });

    // Tap on filled slot -> remove and put back to pool
    container.querySelectorAll('.order-slot.filled').forEach(slot => {
      slot.onclick = () => {
        const slotIdx = parseInt(slot.getAttribute('data-slot'), 10);
        state.order.selected.splice(slotIdx, 1);
        state.order.checked = false;
        renderOrderStep(container);
      };
      slot.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const slotIdx = parseInt(slot.getAttribute('data-slot'), 10);
          state.order.selected.splice(slotIdx, 1);
          state.order.checked = false;
          renderOrderStep(container);
        }
      };
    });

    // Check button
    const checkBtn = document.getElementById('order-check-btn');
    if (checkBtn) {
      checkBtn.onclick = () => {
        const isMatch = state.order.selected.every((ev, idx) => ev === ch.order[idx]);
        state.order.checked = true;
        state.order.isCorrect = isMatch;
        renderOrderStep(container);
      };
    }

    // Try again button
    const resetBtn = document.getElementById('order-reset-btn');
    if (resetBtn) {
      resetBtn.onclick = () => {
        state.order.selected = [];
        state.order.checked = false;
        state.order.isCorrect = false;
        renderOrderStep(container);
      };
    }

    // Proceed to quiz button
    const toQuizBtn = document.getElementById('order-to-quiz-btn');
    if (toQuizBtn) {
      toQuizBtn.onclick = () => {
        state.currentStep = 'quiz';
        updateStepPills();
        renderStepContent();
      };
    }
  }

  // STEP: QUIZ
  function renderQuizStep(container) {
    const ch = window.AWWFY_CHAPTERS[state.currentChapterId];
    const qIndex = state.quiz.questionIndex;

    // Completed state
    if (state.quiz.isFinished) {
      // Find next chapter if available
      const book = window.AWWFY_BOOK;
      const currentIdx = book.chapters.findIndex(c => c.id === state.currentChapterId);
      const nextCh = (currentIdx !== -1 && currentIdx < book.chapters.length - 1) ? book.chapters[currentIdx + 1] : null;
      const canGoNext = nextCh && nextCh.ready;

      container.innerHTML = `
        <div class="quiz-complete-card">
          <div class="quiz-complete-title">Chapter ${state.currentChapterId} complete!</div>
          <div class="quiz-complete-sub">You answered all the questions and finished this chapter.</div>
          <div style="display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; width: 100%;">
            ${canGoNext ? `<button id="quiz-next-ch-btn" class="btn btn-primary" type="button">Next chapter</button>` : ''}
            <button id="quiz-menu-btn" class="btn btn-secondary" type="button">Chapter menu</button>
            <button id="quiz-say-it-btn" class="btn btn-sunshine" type="button">Try: Say it</button>
          </div>
        </div>
      `;

      const nextChBtn = document.getElementById('quiz-next-ch-btn');
      if (nextChBtn && nextCh) {
        nextChBtn.onclick = () => openChapter(nextCh.id);
      }

      document.getElementById('quiz-menu-btn').onclick = () => {
        state.screen = 'menu';
        render();
      };

      document.getElementById('quiz-say-it-btn').onclick = () => {
        state.currentStep = 'sayIt';
        updateStepPills();
        renderStepContent();
      };

      return;
    }

    const q = ch.quiz[qIndex];
    let optionsHtml = '';
    q.options.forEach((opt, idx) => {
      let extraClass = '';
      if (state.quiz.answered) {
        if (idx === q.answer) {
          extraClass = 'correct';
        }
      }
      optionsHtml += `
        <button class="quiz-option-btn ${extraClass}" data-idx="${idx}" type="button" ${state.quiz.answered ? 'disabled' : ''}>
          <span>${opt}</span>
          ${state.quiz.answered && idx === q.answer ? `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
            </svg>
          ` : ''}
        </button>
      `;
    });

    container.innerHTML = `
      <div class="quiz-container">
        <div class="quiz-progress-text">Question ${qIndex + 1} of 4</div>
        <div class="quiz-question">${q.q}</div>

        <div class="quiz-options">${optionsHtml}</div>

        ${state.quiz.hintVisible && !state.quiz.answered ? `
          <div class="quiz-hint-box">${q.hint}</div>
        ` : ''}

        ${state.quiz.answered ? `
          <div class="quiz-why-box">${q.why}</div>
          <div style="display: flex; justify-content: flex-end;">
            <button id="quiz-next-btn" class="btn btn-primary" type="button">
              ${qIndex === 3 ? 'Finish Chapter' : 'Next Question'}
            </button>
          </div>
        ` : ''}
      </div>
    `;

    // Handle Option Click
    container.querySelectorAll('.quiz-option-btn').forEach(btn => {
      btn.onclick = () => {
        const idx = parseInt(btn.getAttribute('data-idx'), 10);
        if (idx === q.answer) {
          // Correct answer
          state.quiz.answered = true;
          state.quiz.selectedOption = idx;
          state.quiz.hintVisible = false;
          renderQuizStep(container);
        } else {
          // Wrong answer: shake button gently and show hint
          btn.classList.add('wrong-shake');
          setTimeout(() => {
            btn.classList.remove('wrong-shake');
          }, 400);
          state.quiz.hintVisible = true;
          const hintBox = container.querySelector('.quiz-hint-box');
          if (!hintBox) {
            renderQuizStep(container);
          }
        }
      };
    });

    // Handle Next Button
    const nextBtn = document.getElementById('quiz-next-btn');
    if (nextBtn) {
      nextBtn.onclick = () => {
        if (qIndex < 3) {
          state.quiz.questionIndex++;
          state.quiz.answered = false;
          state.quiz.selectedOption = null;
          state.quiz.hintVisible = false;
          renderQuizStep(container);
        } else {
          // Quiz finished! Mark chapter as read
          markChapterRead(state.currentChapterId);
          state.quiz.isFinished = true;
          renderQuizStep(container);
        }
      };
    }
  }

  // STEP: SAY IT
  function renderSayItStep(container) {
    const ch = window.AWWFY_CHAPTERS[state.currentChapterId];
    const sayIt = ch.sayIt;
    const hasVoice = 'speechSynthesis' in window;

    container.innerHTML = `
      <div class="say-it-container">
        <div class="say-it-card">
          <div class="say-it-prompt">Read this aloud:</div>
          <div class="say-it-line">"${sayIt.line}"</div>
          ${hasVoice ? `
            <div>
              <button id="say-it-hear-btn" class="btn btn-sunshine btn-small" type="button">Hear it</button>
            </div>
          ` : ''}
          <p style="font-size: 16px; color: var(--grey); margin-top: 8px;">
            Now read it out loud yourself.
          </p>
        </div>

        <div class="say-it-talk-card">
          <div class="say-it-talk-label">Talk about it:</div>
          <div class="say-it-talk-text">${sayIt.talk}</div>
        </div>

        <div style="display: flex; justify-content: flex-end; margin-top: 12px;">
          <button id="say-it-menu-btn" class="btn btn-secondary" type="button">Chapter menu</button>
        </div>
      </div>
    `;

    const hearBtn = document.getElementById('say-it-hear-btn');
    if (hearBtn) {
      hearBtn.onclick = () => {
        speakText(sayIt.line);
      };
    }

    document.getElementById('say-it-menu-btn').onclick = () => {
      stopSpeech();
      state.screen = 'menu';
      render();
    };
  }

  // ORIGINAL BOOK MODAL
  function renderOriginalModal() {
    const container = document.getElementById('original-modal-container');
    if (!container || !state.isOriginalOpen) {
      if (container) container.innerHTML = '';
      return;
    }

    const orig = window.AWWFY_ORIGINALS && window.AWWFY_ORIGINALS[state.currentChapterId];
    const book = window.AWWFY_BOOK;

    if (!orig) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = `
      <div class="modal-overlay" id="modal-overlay-bg">
        <div class="modal-content" role="dialog" aria-modal="true" aria-label="Original book chapter">
          <div class="modal-header">
            <h2 class="modal-title">${orig.title}</h2>
            <button id="modal-close-btn" class="btn btn-secondary btn-small" type="button">Close</button>
          </div>
          <div class="modal-note">
            This is the original text from ${book.year}. Some words are old.
          </div>
          <div class="modal-body">
            ${orig.text}
          </div>
        </div>
      </div>
    `;

    document.getElementById('modal-close-btn').onclick = () => {
      state.isOriginalOpen = false;
      renderOriginalModal();
    };

    const overlay = document.getElementById('modal-overlay-bg');
    if (overlay) {
      overlay.onclick = (e) => {
        if (e.target === overlay) {
          state.isOriginalOpen = false;
          renderOriginalModal();
        }
      };
    }
  }

  // Loading Screen
  function renderLoadingScreen(app) {
    app.innerHTML = `
      <div class="loading-box">
        Loading...
      </div>
    `;
  }

  // Error Screen
  function renderErrorScreen(app) {
    app.innerHTML = `
      <div class="error-screen">
        <h1 class="error-title">Oops!</h1>
        <p class="error-msg">${state.errorMessage || 'Something went wrong.'}</p>
        <button id="error-back-btn" class="btn btn-primary" type="button">Back to Menu</button>
      </div>
    `;

    document.getElementById('error-back-btn').onclick = () => {
      state.screen = 'menu';
      render();
    };
  }

  // Global Keyboard Navigation
  window.addEventListener('keydown', (e) => {
    // If modal is open, Escape closes it
    if (state.isOriginalOpen && e.key === 'Escape') {
      state.isOriginalOpen = false;
      renderOriginalModal();
      return;
    }

    // Story page arrow keys navigation
    if (state.screen === 'chapter' && state.currentStep === 'story' && !state.isOriginalOpen) {
      const ch = window.AWWFY_CHAPTERS[state.currentChapterId];
      if (!ch) return;
      if (e.key === 'ArrowLeft') {
        if (state.currentPage > 0) {
          stopSpeech();
          state.currentPage--;
          renderStepContent();
        }
      } else if (e.key === 'ArrowRight') {
        if (state.currentPage < ch.pages.length - 1) {
          stopSpeech();
          state.currentPage++;
          renderStepContent();
        }
      }
    }
  });

  // Initialize
  document.addEventListener('DOMContentLoaded', () => {
    render();
  });

})();
