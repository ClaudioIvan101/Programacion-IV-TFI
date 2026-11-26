export function shouldSubmitChatOnKey(event, canSend) {
  return canSend
    && event.key === 'Enter'
    && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey
    && !event.nativeEvent?.isComposing && event.nativeEvent?.keyCode !== 229;
}
