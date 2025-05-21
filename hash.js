// archivo para encriptar contraseñas con hash
const bcrypt = require('bcryptjs');

const password = '98765';

bcrypt.hash(password, 10).then(hash => {
  console.log('🔐 Hash generado:', hash);
});
