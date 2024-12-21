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
    margin-bottom: 1rem;
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
      // Estimate video length based on last timestamp in transcript
      const lastTimestamp = subtitles.match(/\[(\d{2}:\d{2})\]/g)?.pop() || '[00:00]';
      const minutes = timeToSeconds(lastTimestamp.slice(1, -1)) / 60;
      
      // Calculate recommended number of points (1 point per ~3-4 minutes, with min 4 and max 8)
      const recommendedPoints = Math.min(Math.max(Math.round(minutes / 3.5), 4), 8);

      const completion = await openai.chat.completions.create({
        model: "gpt-4-1106-preview",
        messages: [
          {
            role: "system",
            content: `You are a helpful assistant that creates clear, concise video summaries. For this ${Math.round(minutes)}-minute video, focus on identifying ${recommendedPoints} key moments or topics, providing informative but concise explanations for each. Each point should be substantial enough to be meaningful but brief enough to be quickly understood.`
          },
          {
            role: "user",
            content: `Analyze this YouTube video transcript and create a detailed summary with the following structure:

1. Start with a concise overview paragraph (2 sentences) that captures the main theme and purpose of the video.

2. Follow with "Key Moments:" containing approximately ${recommendedPoints} points. For each point:
   - Begin with a timestamp
   - Provide 1-2 clear, informative sentences that explain the key concept or discussion
   - Focus on specific details rather than general statements
   - Keep each point focused on a single main idea

Format as:
"<Overview paragraph>

Key Moments:
[timestamp] <Clear explanation of key point 1>
[timestamp] <Clear explanation of key point 2>
..."

Transcript:
${subtitles}

Return only the formatted output, with no additional explanations.`
          }
        ]
      });
      
      // Format the response
      const rawSummary = completion.choices[0].message.content;
      
      // Check if the summary contains "Key Moments:" before splitting
      if (rawSummary.includes('Key Moments:')) {
        const [mainParagraph, points] = rawSummary.split('Key Moments:');
        
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

        summary = `${mainParagraph.trim()}\n\nKey Moments:\n${formattedPoints}`;
      } else {
        // If the response doesn't contain "Key Moments:", just use it as is
        summary = rawSummary;
      }
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
      currentVideoId = getVideoId();
      await loadSubtitles();

      // Listen for navigation events
      document.addEventListener('youtube-navigation', async () => {
        console.log('Navigation event received');
        currentVideoId = getVideoId();
        summary = ''; // Clear previous summary
        subtitles = ''; // Clear previous subtitles
        hasSubtitles = false; // Reset subtitles flag
        await loadSubtitles(); // Load new subtitles
      });

      // Add click handlers to all timestamp links
      document.addEventListener('click', (e) => {
        if (e.target.classList.contains('timestamp-link')) {
          const seconds = parseInt(e.target.dataset.time);
          handleTimestampClick(seconds, e);
        }
      });
    });
  });

  // Separate subtitles loading logic
  async function loadSubtitles() {
    try {
      console.log('Loading subtitles for video:', getVideoId());
      subtitles = await extractSubtitles();
      hasSubtitles = subtitles.length > 0;
      error = null;
      console.log('Loaded subtitles:', subtitles.substring(0, 100) + '...');
    } catch (err) {
      console.error('Error loading subtitles:', err);
      error = err.message;
      hasSubtitles = false;
      subtitles = '';
    }
  }

  // Function to extract subtitles from YouTube video
  async function extractSubtitles() {
    try {
      console.log('Fetching subtitles for current video');

      // Get fresh page data each time
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

      // Add cache-busting parameter to URL
      const cacheBustUrl = `${subtitleTrack.baseUrl}&_t=${Date.now()}`;
      const response = await fetch(cacheBustUrl);
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

      console.log('Formatted transcript:', formattedTranscript.substring(0, 100) + '...');
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
