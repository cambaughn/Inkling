import '../styles/global.css';
import App from './App.svelte';

console.log('Content script loaded and running');

let app = null;

function initializeApp() {
  console.log('Initializing app');
  const targetContainer = document.getElementById("secondary-inner");
  if (targetContainer) {
    // Clean up existing app if it exists
    if (app) {
      app.$destroy();
      const oldRoot = document.getElementById("inkling-root");
      if (oldRoot) oldRoot.remove();
    }

    // Create new root and app
    const root = document.createElement("div");
    root.id = "inkling-root";
    targetContainer.insertBefore(root, targetContainer.firstChild);
    
    app = new App({
      target: root,
    });
  }
}

// Watch for navigation events
let currentUrl = location.href;
let previousSubtitles = '';

const observer = new MutationObserver(() => {
  if (location.href !== currentUrl) {
    currentUrl = location.href;
    if (currentUrl.includes('youtube.com/watch')) {
      // Store current subtitles before navigation
      previousSubtitles = document.documentElement.innerHTML.match(/"captionTracks":(\[.*?\])/)?.[0] || '';
      console.log('Previous subtitles stored:', previousSubtitles.substring(0, 100) + '...');

      // Give YouTube time to update its DOM and inject the new video data
      setTimeout(() => {
        console.log('URL changed, checking for new subtitles...');
        
        const checkForNewCaptions = setInterval(() => {
          const currentSubtitles = document.documentElement.innerHTML.match(/"captionTracks":(\[.*?\])/)?.[0] || '';
          console.log('Current subtitles:', currentSubtitles.substring(0, 100) + '...');
          
          // Only proceed if we have new subtitles different from the previous ones
          if (currentSubtitles && currentSubtitles !== previousSubtitles) {
            clearInterval(checkForNewCaptions);
            console.log('New captions found, dispatching navigation event');
            document.dispatchEvent(new CustomEvent('youtube-navigation'));
            previousSubtitles = currentSubtitles;
          } else {
            console.log('Still seeing old subtitles or no subtitles, waiting...');
          }
        }, 500);
        
        // Set a timeout to prevent infinite checking
        setTimeout(() => {
          clearInterval(checkForNewCaptions);
          console.log('Timed out waiting for new subtitles');
        }, 10000);
      }, 1000);
    }
  }
});

observer.observe(document, { subtree: true, childList: true });

// Initial load
initializeApp();
