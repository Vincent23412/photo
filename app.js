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

const NodeCache = require("node-cache");
const photoCache = new NodeCache({ stdTTL: 600 });


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
    console.log('/');
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


// app.get('/secret', (req, res, next)=>{
//     res.sendFile(__dirname+'/html/secret.html');
//     // res.status(200).send('secret');
//     // res.render('secret', { name: req.user.name });
// })

app.get('/protected', passport.authenticate('jwt', { session: false , failureRedirect: '/'}), (req, res) => {
    // 如果请求到达这里，说明JWT验证通过
    // res.json({ message: 'This is a protected route.', user: req.user });
    // console.log('protected');
    // console.log(req.user);
    // res.sendFile(__dirname+'/html/secret.html');
    res.render('secret', { name: req.user.name });
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
        sort_photo(results.rows);
        res.status(200).send(results.rows);
    })
});

app.get('/all_photo', (req, res, next)=>{
    res.sendFile(__dirname+'/html/photo.html');
})

app.put('/like/:id', (req, res, next) => {
    const id = req.params.id;
    pool.query('UPDATE photo SET like_num = like_num + 1 WHERE id = $1', [id], (err, results) => {
        if (err) {
            return res.status(404).send('Error updating like number');
        }
        res.status(200).send('Success');
    });
});

app.get('/register', (req, res, next) =>{
    res.sendFile(__dirname+'/html/register.html');
})

app.post('/register', (req, res, next) =>{
    const name = req.body.username;
    const account = req;
    pool.query('INSERT INTO users(name, account, password) VALUES ($1, $2, $3)', [req.body.username, req.body.account, req.body.password], (err, results)=>{
        if (err){
            return res.status(404).send('Error');
        }
        // res.status(200).send('success');
        res.redirect('/');
    })
})

app.delete('/delete/:id', (req, res, next)=>{
    const id = req.params.id;
    console.log(id);
    pool.query('DELETE FROM photo WHERE id = $1', [id], (err, results)=>{
        if (err){
            return res.status(404).send('Error');
        }
        res.status(200).send('success');
    })
})

// app.get('/show_all_photo', passport.authenticate('jwt', {session: false}) ,(req, res, next)=>{
//     pool.query('SELECT * FROM photo WHERE owner = $1', [req.user.name], (err, results)=>{
//         if (err) return res.status(404).send('error');
//         res.status(200).send(results.rows);
//     })
// })
app.get('/show_all_photo', passport.authenticate('jwt', {session: false}), (req, res, next) => {
    const cacheKey = `photos_${req.user.name}`; // 为每个用户创建一个唯一的缓存键
    const cachedPhotos = photoCache.get(cacheKey);

    if (cachedPhotos) {
        // 如果缓存命中，直接返回缓存的数据
        return res.status(200).send(cachedPhotos);
    } else {
        // 缓存未命中，从数据库查询
        pool.query('SELECT * FROM photo WHERE owner = $1', [req.user.name], (err, results) => {
            if (err) return res.status(404).send('error');

            // 将查询结果存储到缓存中
            photoCache.set(cacheKey, results.rows);

            // 返回查询结果
            res.status(200).send(results.rows);
        });
    }
});

app.get('/all_comment/:id', (req, res, next) =>{
    const id = req.params.id;
    const cacheKey = `comment_${req.params.id}`; 
    const cachedPhotos = photoCache.get(cacheKey);
    if (cachedPhotos) {
        // 如果缓存命中，直接返回缓存的数据
        return res.status(200).send(cachedPhotos);
    } else {
        pool.query('SELECT commentor_id, content, photo_id, name FROM comment JOIN users ON comment.commentor_id = users.id WHERE photo_id = $1', [id], (err, results)=>{
            if (err) return res.status(404).send('error');

            photoCache.set(cacheKey, results.rows);

            res.status(200).send(results.rows);
    })}
})
app.post('/comment', (req, res, next) => {
    passport.authenticate('jwt', {session: false}, (err, user, info) => {
        // 错误处理
        if (err) {
            console.log('Authentication error');
            return res.status(500).send('Authentication error');
        }
        // 用户不存在处理
        if (!user) {
            console.log('No user found');
            return res.status(401).send('No user found');
        }
        
        // 用户验证成功，将用户信息添加到请求对象中
        req.user = user;

        // 继续处理请求
        console.log(req.user);
        const commentor_id = req.user.id;
        const comment = req.body.content;
        const photo_id = req.body.photo_id;
        console.log(commentor_id, comment, photo_id);

        pool.query('INSERT INTO comment (commentor_id, content, photo_id) VALUES($1, $2, $3);', [commentor_id, comment, photo_id], (err, results) => {
            if (err) {
                console.error(err); // 在服务器日志中记录错误详情
                return res.status(500).send('An error occurred while saving the comment');
            }
            // 成功处理，这里可以根据需要进行跳转或发送成功响应
            res.status(201).send('Comment added successfully');
        });
    })(req, res, next); // 立即调用这个函数
});

app.get('/health', (req, res,next)=>{
    res.status(200).send('health');
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


const sort_photo = (data) =>{
    // console.log('sort_photo');
    for (let i = data.length - 1; i > 0; i--){
        for (let j = 0 ; j < i ; j++){
            // console.log(data[j]['id']);
            // console.log('done');
            if (data[j].like_num < data[j+1].like_num){
                let temp = data[j];
                data[j] = data[j+1];
                data[j+1] = temp;
            }
        }
    }
}
