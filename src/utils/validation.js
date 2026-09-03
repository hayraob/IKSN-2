function cleanString(value, max = 200) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}
function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
function oneOf(value, allowed) {
  return allowed.includes(value);
}
module.exports = { cleanString, isEmail, oneOf };
