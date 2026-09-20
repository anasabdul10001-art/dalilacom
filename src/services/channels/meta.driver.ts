import { ChannelDriverImpl } from "./types";

// Facebook / Instagram / WhatsApp go through Meta's platform, which requires a registered Meta developer
// app and Meta's review before it can read or send anything. Until that is done the channel exists in the
// catalogue but cannot be connected — it fails loudly instead of pretending to work.
export const metaPendingDriver: ChannelDriverImpl = {
  validateCredentials() {
    return "هالقناة بانتظار ربط تطبيق Meta والموافقة عليه — لسا مو متاحة";
  },
  parseIncoming() {
    return null;
  },
  async sendReply() {
    throw new Error("Meta channels are not connected yet");
  },
};
