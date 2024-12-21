chrome.runtime.onInstalled.addListener(() => {
  console.log('on installed');
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'GET_TAB_ID') {
    sendResponse({ tabId: sender.tab.id });
  }
});