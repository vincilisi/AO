export const updateCrm = async (email: any) => {
  return {
    customer: email.from,
    lastContact: new Date(),
    lastEmailSubject: email.subject,
  };
};
