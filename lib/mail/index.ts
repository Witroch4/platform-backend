import { Resend } from "resend";

let mail: Resend | null = null;

function getMailInstance(): Resend {
  if (!mail) {
    if (!process.env.AUTH_RESEND_KEY) {
      throw new Error("AUTH_RESEND_KEY environment variable is required");
    }
    mail = new Resend(process.env.AUTH_RESEND_KEY);
  }
  return mail;
}

export default getMailInstance;
