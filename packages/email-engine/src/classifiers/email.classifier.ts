const classifyEmail = async (email) => {
  const text = email.text.toLowerCase();

  if (text.includes("preventivo")) return "preventivo";
  if (text.includes("ordine")) return "ordine";
  if (text.includes("informazioni")) return "informazioni";
  if (text.includes("reclamo")) return "reclamo";

  return "generale";
};

module.exports = { classifyEmail };
