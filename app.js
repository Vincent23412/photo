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

const multer  = require('multer');
const fs = require('fs');

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
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
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
    console.log(token);
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

// 配置Multer的存储选项
const storage = multer.diskStorage({
    destination: (req, file, cb) =>{
        cb(null, 'uploads/');
    }, 
    filename: (req, file, cb) =>{
        console.log('storage');
        console.log(req.user);
        req.link = req.user.name + '-' + file.fieldname + '-' + Date.now() + file.originalname;
        cb(null, req.user.name + '-' + file.fieldname + '-' + Date.now() + file.originalname);
    }
})

const upload = multer({storage: storage});

app.post('/upload', passport.authenticate('jwt', {session: false}) , upload.single('file'), (req, res, next)=>{
    // res.send('upload success');
    // console.log(req.user, req.link);
    pool.query('INSERT INTO photo (owner, like_num, link) values ($1, $2, $3);', [req.user.name, 0, req.link],(err, results) =>{
        if (err) return res.status(200).send('error');
        res.redirect('/all_photo');

    })
})

app.get('/get_photo', (req, res, next) => {
    // 舊版本，去資料夾裡找
    // const uploadDir = path.join(__dirname, 'uploads');
    // const user_picture = {'picture': [], 'user': []};
    // fs.readdir(uploadDir, (err, files)=>{
    //     if (err) return res.status(400).send('error');
    //     files.forEach(file => {
    //         const picture_url = path.join(__dirname, 'uploads', file);
    //         console.log(picture_url);
    //         user_picture['picture'].push('/uploads/' + file);
    //         user_picture['user'].push(file.split('-')[0]); 
    //         console.log(file.split('-')[0])
    //     });
    //     res.status(200).send(user_picture);
    // })

    // 去資料庫裡找
    pool.query('SELECT * FROM photo', (err, results) =>{
        // console.log(results.rows);
        res.status(200).send(results.rows);
    })
});

app.get('/all_photo', (req, res, next)=>{
    res.sendFile(__dirname+'/html/photo.html');
})

app.get('/like/:id', (req, res, next)=>{
    const id = req.params.id;
    pool.query('UPDATE photo SET like_num = like_num + 1 WHERE id = $1', [id], (err, results)=>{
        if (err) throw res.status(404).send('error');
        res.status(200).send('success');
        // res.redirect('/all_photo');
    })
})

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
