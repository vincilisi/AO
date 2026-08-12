const parseEmail = (email) => {
  return {
    messageId: email.messageId || "",
    from: email.from?.text || "",
    to: email.to?.text || "",
    subject: email.subject || "",
    text: email.text || "",
    html: email.html || "",
  };
};

module.exports = { parseEmail };
