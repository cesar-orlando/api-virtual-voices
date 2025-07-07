import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

async function createUserDirectTest() {
  const uri = 'mongodb+srv://quicklearning:VV235.@quicklearning.ikdoszo.mongodb.net/test?retryWrites=true&w=majority&appName=quicklearning/prod';
  await mongoose.connect(uri);
  const userSchema = new mongoose.Schema({
    name: String,
    email: String,
    password: String,
    role: String,
    companySlug: String,
    status: Number
  });
  const User = mongoose.model('User', userSchema, 'users');

  const email = 'admin@quicklearning.com';
  const password = 'QuickLearning2024!';
  const hashedPassword = await bcrypt.hash(password, 10);
  const name = 'Admin Quick Learning';
  const role = 'admin';
  const companySlug = 'quicklearning';

  let user = await User.findOne({ email });
  if (user) {
    user.password = hashedPassword;
    user.role = role;
    user.name = name;
    user.companySlug = companySlug;
    user.status = 1;
    await user.save();
    console.log('✅ Usuario actualizado:', user.email);
  } else {
    user = new User({
      name,
      email,
      password: hashedPassword,
      role,
      companySlug,
      status: 1
    });
    await user.save();
    console.log('✅ Usuario creado:', user.email);
  }

  await mongoose.connection.close();
  console.log('\n🔌 Conexión cerrada');
}

createUserDirectTest(); 