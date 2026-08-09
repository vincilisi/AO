export const createTask = async (email: any) => {
  return {
    id: Date.now(),
    title: email.subject,
    description: email.text,
    from: email.from,
  };
};
