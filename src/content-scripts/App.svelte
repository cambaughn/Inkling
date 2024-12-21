<style>
  :global(:root) {
    --content-height: 300px;
    --preview-height: 25px;
    --preview-width: 60px;
    --inkling-color: #21FD5E;
  }

  .inkling-content {
    width: 100%;
    color: white;
    font-weight: 500;
    font-size: 14px;
    font-family: "Roboto", "Arial", sans-serif;
    z-index: 9999;
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: flex-start;
  }

  .mainContent {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: flex-start;
    background-color: #292929;
    border-radius: 10px;
    color: white;
    padding: 20px;
    box-sizing: border-box;
  }

  .header {
    font-size: 2rem;
    line-height: 2.8rem;
    font-weight: 700;
  }

  .summary {
    white-space: pre-wrap;
    line-height: 2rem;
    font-size: 1.4rem;
    font-weight: 400;
    padding-top: 20px;
  }

  .summary :global(p) {
    font-size: 1.6rem;
    line-height: 2.4rem;
    margin-bottom: 2rem;
  }

  .summary :global(li) {
    list-style: none;
    margin-bottom: 1rem;
    margin-left: 0;
    padding-left: 0;
  }

  .summary :global(a) {
    color: #3ea6ff;
    text-decoration: none;
    margin-right: 8px;
  }

  .summary :global(a:hover) {
    color: #3ea6ff;
  }

  .summarizeButton {
    padding: 10px 20px;
    background-color: #3D3D3D;
    color: white;
    border: none;
    cursor: pointer;
    width: 100%;
    border-radius: 5px;
  }

  .summarizeButton:disabled {
    cursor: default;
  }

  .error {
    color: red;
    font-weight: bold;
  }
</style>

<script>
  import { onMount } from 'svelte';
  import he from 'he';
  import OpenAI from 'openai';
  import { marked } from 'marked';
  import { OPENAI_API_KEY } from '../config.js';

  let error = null;
  let hasSubtitles = false;
  let subtitles = '';
  let summary = '';
  let isLoading = false;
  let currentVideoId = null;
  let tabId = null;

  // Add OpenAI client initialization
  const openai = new OpenAI({
    apiKey: OPENAI_API_KEY,
    dangerouslyAllowBrowser: true
  });

  // Add summarize function
  async function summarizeTranscript() {
    isLoading = true;
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4-1106-preview",
        messages: [
          {
            role: "system",
            content: "You are a helpful assistant that creates concise, informative summaries of video transcripts with timestamps. Focus on the main topics and key points."
          },
          {
            role: "user",
            content: `Extract the key information from the provided transcript of a YouTube video. Your task is to provide a concise summary and the key points as a single block of text. Format your response as follows:

"<Summary of the video content>. Key points include: [timestamp] <Key point 1>, [timestamp] <Key point 2>, ..."

Transcript:
${subtitles}

Return only the output as a single block of text, with no additional formatting or explanations.`
          }
        ]
      });
      
      // Format the response
      const rawSummary = completion.choices[0].message.content;
      const [mainParagraph, points] = rawSummary.split('Key points include:');
      
      // Create timestamps with onclick handlers instead of links
      const formattedPoints = points
        .split(/\[(\d{2}:\d{2})\]/)
        .filter(Boolean)
        .reduce((acc, curr, i, arr) => {
          if (i % 2 === 0) return acc;
          const timestamp = curr;
          const seconds = timeToSeconds(timestamp);
          const text = arr[i + 1].trim();
          return acc + `- <a href="#" data-time="${seconds}" class="timestamp-link">${timestamp}</a>${text}\n`;
        }, '');

      summary = `${mainParagraph.trim()}\n\n${formattedPoints}`;
    } catch (err) {
      error = err.message;
    } finally {
      isLoading = false;
    }
  }

  // Helper function to convert timestamp to seconds
  function timeToSeconds(timestamp) {
    const [minutes, seconds] = timestamp.split(':').map(Number);
    return minutes * 60 + seconds;
  }

  // Helper function to get current video ID
  function getVideoId() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('v');
  }

  function smoothScrollToTop(duration = 200) {
    const start = window.pageYOffset;
    const startTime = performance.now();
    
    function scroll(currentTime) {
      const timeElapsed = currentTime - startTime;
      const progress = Math.min(timeElapsed / duration, 1);
      
      window.scrollTo(0, start * (1 - progress));
      
      if (progress < 1) {
        requestAnimationFrame(scroll);
      }
    }
    
    requestAnimationFrame(scroll);
  }

  function handleTimestampClick(seconds, event) {
    event.preventDefault();
    smoothScrollToTop(200);
    document.querySelector('video').currentTime = seconds;
  }

  onMount(async () => {
    // Get unique tab ID
    chrome.runtime.sendMessage({ type: 'GET_TAB_ID' }, async (response) => {
      tabId = response.tabId;
      
      // Initial load
      await loadSubtitles();

      // Listen for URL changes
      const observer = new MutationObserver(async (mutations) => {
        const newVideoId = getVideoId();
        if (newVideoId && newVideoId !== currentVideoId) {
          currentVideoId = newVideoId;
          summary = ''; // Clear previous summary
          await loadSubtitles();
        }
      });

      // Watch for changes in the URL
      observer.observe(document.querySelector('title'), {
        subtree: true,
        characterData: true,
        childList: true
      });

      // Add click handlers to all timestamp links
      document.addEventListener('click', (e) => {
        if (e.target.classList.contains('timestamp-link')) {
          const seconds = parseInt(e.target.dataset.time);
          handleTimestampClick(seconds, e);
        }
      });
    });

    return () => {
      if (observer) observer.disconnect();
    };
  });

  // Separate subtitles loading logic
  async function loadSubtitles() {
    try {
      subtitles = await extractSubtitles();
      hasSubtitles = subtitles.length > 0;
      error = null;
    } catch (err) {
      error = err.message;
      hasSubtitles = false;
      subtitles = '';
    }
  }

  // Function to extract subtitles from YouTube video
  async function extractSubtitles() {
    try {
      console.log('Fetching subtitles for current video');

      const videoPageData = document.documentElement.innerHTML;
      if (!videoPageData.includes('captionTracks')) {
        throw new Error('Could not find captions for this video');
      }

      const regex = /"captionTracks":(\[.*?\])/;
      const [match] = regex.exec(videoPageData);
      const { captionTracks } = JSON.parse(`{${match}}`);
      const subtitleTrack = captionTracks.find(track => track.vssId === '.en' || track.vssId === 'a.en' || track.vssId.match('.en'));

      if (!subtitleTrack || !subtitleTrack.baseUrl) {
        throw new Error('Could not find English captions for this video');
      }

      const response = await fetch(subtitleTrack.baseUrl);
      const transcript = await response.text();

      const formatTime = (seconds) => {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
      };

      const formattedTranscript = transcript
        .replace('<?xml version="1.0" encoding="utf-8" ?><transcript>', '')
        .replace('</transcript>', '')
        .split('</text>')
        .filter(line => line && line.trim())
        .map(line => {
          const start = line.match(/start="([\d.]+)"/)?.[1];
          const htmlText = line
            .replace(/<text.+?>/, '')
            .replace(/<\/?[^>]+(>|$)/g, '');

          const decodedText = he.decode(htmlText);
          const cleanText = decodedText
            .replace(/&#39;/g, "'")
            .replace(/&quot;/g, '"')
            .replace(/[\n\r]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

          return `[${formatTime(parseFloat(start))}] ${cleanText}`;
        })
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

      console.log('Formatted transcript:', formattedTranscript);
      return formattedTranscript;
    } catch (error) {
      console.error('Error fetching subtitles:', error);
      throw error;
    }
  }
</script>

<div class="inkling-content">
  <div class="mainContent">
    {#if error}
      <p class="error">{error}</p>
    {/if}
    
    {#if hasSubtitles && !summary}
      <button 
        class="summarizeButton" 
        on:click={summarizeTranscript} 
        disabled={isLoading}
      >
        {isLoading ? 'Summarizing...' : 'Summarize Video'}
      </button>
    {/if}
    
    {#if summary}
      <p class="summary">{@html marked(summary)}</p>
    {/if}
  </div>
</div>
