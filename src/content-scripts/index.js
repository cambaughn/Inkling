import '../styles/global.css';
import App from './App.svelte';

console.log('Content script loaded and running');

function placeContainerWhenAvailable() {
  console.log('Observer started');

  const observer = new MutationObserver((mutations, obs) => {
    console.log('DOM mutation observed');
    const targetContainer = document.getElementById("secondary-inner");
    if (targetContainer) {
      console.log("Target container found, rendering app");
      const root = document.createElement("div");
      root.id = "inkling-root";
      // Insert the component as the first child of the target container
      targetContainer.insertBefore(root, targetContainer.firstChild);
      
      new App({
        target: root,
      });
      
      obs.disconnect(); // Stop observing once the element is found and the component is rendered
    } else {
      console.log("Target container not found yet");
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// Remove DOMContentLoaded event listener and execute immediately
console.log('Executing placeContainerWhenAvailable');
placeContainerWhenAvailable();

// We don't need to export the app instance in this case
