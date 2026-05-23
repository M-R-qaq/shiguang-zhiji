export function getWelcomeMessage(nickname: string | null): string {
  if (nickname) {
    return `${nickname}，你好呀！我是苏怀真，这面食光鉴带我穿越千年，来到你的餐桌旁。以后你吃饭的时候，我就在这里陪你聊天、分享美食。`;
  }
  return '你好呀，我是苏怀真。这面食光鉴带我穿越千年，来到你的餐桌旁。以后你吃饭的时候，我就在这里陪你聊天、分享美食。';
}
