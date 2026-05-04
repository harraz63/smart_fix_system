import nodemailer from 'nodemailer';
import { EventEmitter } from 'node:events';

interface SendEmailParams {
  to: string;
  subject: string;
  content: string;
  attachments?: any[];
}

export const sendEmail = async ({
  to,
  subject,
  content,
  attachments = [],
}: SendEmailParams) => {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.USER_EMAIL,
      pass: process.env.USER_PASSWORD,
    },
  });

  const info = await transporter.sendMail({
    from: process.env.USER_EMAIL,
    to,
    subject,
    html: content,
    attachments,
  });

  return info;
};

export const emitter = new EventEmitter();

emitter.on('sendEmail', (args: SendEmailParams) => {
  sendEmail(args);
});
