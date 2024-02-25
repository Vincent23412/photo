const express = require('express');
const Pool = require('pg').Pool;
const morgan = require('morgan');
const path = require("path");
// jwt
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const JwtStrategy = require('passport-jwt').Strategy,
      ExtractJwt = require('passport-jwt').ExtractJwt;
const SECRET_KEY = 'your_secret_key';
require('dotenv').config();

const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

const pool = new Pool({
    user: process.env.USER,
    host: process.env.HOST,
    database: process.env.DATABASE,
    password: process.env.PASSWORD,
    port: process.env.PORT,
    ssl: {
        rejectUnauthorized: false
    }
})

const app = express(); 
PORT = 3000;

app.use(morgan('dev'));
app.use(express.json());
app.use(
    express.urlencoded({
      extended: true,
    })
)
app.set("view engine", "ejs");
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, "public")));
app.use(cookieParser()); // 添加这行来解析Cookie

app.use(passport.initialize());

passport.use(new LocalStrategy((username, password, done)=>{
    console.log('LocalStrategy');
    findUserByName(username, (err, user) =>{
        if (err) return done('error');
        console.log(user);
        if (user.password !== password) return done(null, false);
        done(null, user);
    })
}))

const cookieExtractor = function(req) {
    let token = null;
    if (req && req.cookies) {
        token = req.cookies['token']; // 尝试从名为'token'的Cookie中获取JWT
    }
    return token;
};


const opts = {
    jwtFromRequest: cookieExtractor,
    secretOrKey: SECRET_KEY // 使用与生成JWT相同的密钥
};

passport.use(new JwtStrategy(opts, (jwt_payload, done) => {
    console.log('JwtStrategy');
    console.log(jwt_payload);
    findUserById(jwt_payload.id, (err, user) => { // 假设你有一个根据ID查找用户的函数
        if (err) {
            return done(err, false);
        }
        if (user) {
            return done(null, user); // 验证成功
        } else {
            return done(null, false); // 验证失败
        }
    });
}));

app.get('/', (req, res, next)=>{
    res.sendFile(__dirname+'/html/index.html');
})

app.post('/login', passport.authenticate('local', {session:false, failureRedirect:'/'}), (req, res) =>{
    const payload = { id: req.user.id, username: req.user.name }; // 以用户ID作为JWT的主题
    const token = jwt.sign(payload, SECRET_KEY, { expiresIn: '1h' }); // 设置过期时间为1小时
    // res.json({ token: token , redirectUrl: '/protected', username: req.user.name}); // 发送包含JWT的响应
    res.cookie('token', token, { httpOnly: true });
    res.redirect('/protected');
})


app.get('/secret', (req, res, next)=>{
    res.sendFile(__dirname+'/html/secret.html');
    // res.status(200).send('secret');
})

app.get('/protected', passport.authenticate('jwt', { session: false }), (req, res) => {
    // 如果请求到达这里，说明JWT验证通过
    // res.json({ message: 'This is a protected route.', user: req.user });
    console.log('protected');
    res.sendFile(__dirname+'/html/secret.html');
});

app.get('/logout', (req, res) => {
    // 清除名为'token'的JWT Cookie
    res.cookie('token', '', { expires: new Date(0) });
    res.redirect('/'); // 可以重定向到登录页面或主页
});

app.listen(PORT, () =>{
    console.log('listening');
});

const findUserByName = async (username, done) =>{
    pool.query('SELECT * FROM users WHERE name = $1', [username], (err, results)=>{
        if (err) return done('error');
        if (results.rows.length > 0){
            done(null, results.rows[0]);
        }else{
            done(null, false);
        }
    })
}

const findUserById = async (id, done) =>{
    console.log('finduserbyid');
    pool.query('SELECT * FROM users WHERE id = $1', [id], (err, results)=>{
        if (err) return done('error');
        if (results.rows.length > 0){
            done(null, results.rows[0]);
        }else{
            done(null, false);
        }
    })
}
