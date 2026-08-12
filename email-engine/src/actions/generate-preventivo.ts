export const generatePreventivo = async (email: any) => {
  return {
    id: Date.now(),
    cliente: email.from,
    contenuto: "Preventivo generato automaticamente",
  };
};
