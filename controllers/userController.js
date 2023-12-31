
const expressAsyncHandler = require('express-async-handler');
const User = require('../models/userModel');
const sendTokenWithCookie = require('../utils/cookieToken');
const sendEmail = require('../utils/sendEmail.js');
const crypto = require('crypto');
const cloudinary = require('cloudinary');
const setCorsHeaders = require('../middleware/corsmiddleware');


const userRegistration = expressAsyncHandler(async (req, res) => {
    if (!req.body) {
        res.status(400);
        throw new Error("Nothin in request");
    };
    const { name, email, avatar, password } = await req.body;
    if (!name || !email || !avatar || !password) {
        res.status(400);
        throw new Error("Something is missing");
    };
    //upload the avatar to the cloudinary
    const result = await cloudinary.v2.uploader.upload(avatar, {
        folder: 'avatars',
    })

    req.body.avatar = {
        public_id: result.public_id,
        url: result.secure_url,
    };

    const userExists = await User.findOne({ 'email': email });
    if (userExists) {
        res.status(409);
        throw new Error("An email already exists, try with different email");
    };
    const registeredUser = await User.create(req.body);
    if (!registeredUser) {
        res.status(400)
        throw new Error("User not created, try again");
    };
    sendTokenWithCookie(registeredUser, 201, res);
});

const userLogin = expressAsyncHandler(async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        res.status(400);
        throw new Error("Something is missing");
    };
    // +password because we exclude in our schema;
    const userFound = await User.findOne({ 'email': email }).select('+password');
    if (!userFound) {
        res.status(409);
        throw new Error("Invalid credentials");
    };
    //method to compare password with db
    const isPasswordMatched = await userFound.comparePassword(password);
    if (!isPasswordMatched) {
        res.status(409);
        throw new Error("Invalid credentials");
    };

    sendTokenWithCookie(userFound, 200, res);

});
//Logout function
const logout = expressAsyncHandler(async (req, res) => {

    res.cookie("token", null, {
        expires: new Date(Date.now()),
        httpOnly: true,
    });

    res.status(200).json({
        success: true,
        message: "Logged out Successfully",
    });

});

//forgot password to send mail to user for recovery
const forgotPassword = expressAsyncHandler(async (req, res) => {
    const { email } = req.body;
    const user = await User.findOne({ 'email': email });
    if (!user) {
        res.status(404);
        throw new Error("User not Found");
    };
    const resetToken = user.getResetPasswordToken(); //it return resetToken
    // our user has already created, we call getResetPasswordToken, it will add resetToken and expires time but will not save untill we do it manually.
    await user.save({ validateBeforeSave: false });
    //resetpasswordUrl
    const resetPasswordUrl = `${process.env.REACT_APP_BASE_URL}/password/reset/${resetToken}`;
    //message for customers
    const message = `Here is your password Reset Token :- \n\n ${resetPasswordUrl} 
    \n\n\n if you have not requested this email, please ignore it.`;
    //
    try {
        //send Email function with an object object
        await sendEmail({
            email: user.email,
            subject: 'Chic Choice Maven Password Recovery.',
            message,
        });
        res.status(200).json({
            success: true,
            message: "Email sent Successfully 😎."
        })
    } catch (err) {
        //if any error comes, we need to undefine both resetpasswordtoken and expire time.
        user.resetPasswordToken = undefined;
        user.resetPasswordExpire = undefined;
        await user.save({ validateBeforeSave: false });
        //its an server error;
        res.status(500);
        throw new Error(err.message);
    };

});
// resetPassword when clicks on forgot link

const resetPassword = expressAsyncHandler(async (req, res) => {
    //we create the hash of our token which we have sent to the forgot link, 
    // converting randombyte to hash again inOrder to compare it to database
    const resetPasswordToken = crypto
        .createHash("sha256")
        .update(req.params.token)
        .digest("hex");

    // we will find that user with this token and if the time is greater than now.
    const user = await User.findOne({
        resetPasswordToken,
        resetPasswordExpire: { $gt: Date.now() }
    });
    if (!user) {
        res.status(404);
        throw new Error("Either token is invlid or Time has expired");
    };

    if (req.body.password != req.body.confirmPassword) {
        res.status(400);
        throw new Error("password don't match");
    };

    user.password = req.body.password;
    user.resetPasswordToken = undefined; //remove from databse after reset password
    user.resetPasswordExpire = undefined;
    await user.save();

    sendTokenWithCookie(user, 200, res);  //to login user 

});
//getUser own details

const getUserDetails = expressAsyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id);
    res.status(200).json({
        success: true,
        user: user
    })
});
//update password in the profile
const updatePassword = expressAsyncHandler(async (req, res) => {
    const { oldPassword, newPassword, confirmPassword } = req.body;
    const user = await User.findById(req.user.id).select("+password");
    //will compare current password to the database
    const isPasswordMatched = await user.comparePassword(oldPassword);
    if (!isPasswordMatched) {
        res.status(400);
        throw new Error("Password is incorrect");
    };
    if (newPassword !== confirmPassword) {
        res.status(400);
        throw new Error("passwords does not match");
    };
    user.password = newPassword;
    await user.save();
    sendTokenWithCookie(user, 200, res);
});
//update User profile
const updateProfile = expressAsyncHandler(async (req, res) => {

// delete previous image from the cloudinary by using public id
    const { result } = await cloudinary.v2.uploader.destroy(req.body.publicId, {
        folder: 'avatars',
    });

    // upload new avatar image of the user.
    let updateAvatar;
    if (result === 'ok') {
        updateAvatar = await cloudinary.v2.uploader.upload(req.body.avatar, {
        });

    } else {
        throw new Error(result);
    }
    req.body.avatar = {
        public_id: updateAvatar.public_id,
        url: updateAvatar.url
    };
    const user = await User.findByIdAndUpdate(req.user.id, req.body, {
        new: true,
        runValidators: true,
        useFindAndModify: false,
    });

    res.status(200).json({
        success: true,
        message: "user updated successfully",
    })

});
//get all users for --admin
const getAllUsers = expressAsyncHandler(async (req, res) => {
    const users = await User.find();
    if (!users) {
        res.status(404);
        throw new Error("users not found");
    };
    res.status(200).json({
        success: true,
        usersList: users,
    });
});
// get Single user for admin with the id
const getSingleUser = expressAsyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) {
        res.status(404);
        throw new Error(`User not found with this id: ${req.params.id}`);
    };

    res.status(200).json({
        success: true,
        user: user,
    });
});
//update role of the user --admin
const updateRole = expressAsyncHandler(async (req, res) => {
    const newUserData = {
        role: req.body.role,
    };

    const user = await User.findByIdAndUpdate(req.params.id, newUserData);
    if (!user) {
        throw new Error("User not found with this id")
    }
    res.status(200).json({
        success: true,
        message: "role updated successfully with information."
    });
});
//delete user --admin
const deleteUser = expressAsyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) {
        res.status(404);
        throw new Error(`User not Found with this id: ${req.params.id}`);
    };
    await User.findByIdAndDelete(req.params.id);
    res.status(200).json({
        success: true,
        message: 'User deleted successfully.'
    });
});



module.exports = {
    userRegistration: setCorsHeaders(userRegistration),
    userLogin: setCorsHeaders(userLogin),
    logout: setCorsHeaders(logout),
    forgotPassword: setCorsHeaders(forgotPassword),
    resetPassword: setCorsHeaders(resetPassword),
    getUserDetails: setCorsHeaders(getUserDetails),
    updatePassword: setCorsHeaders(updatePassword),
    updateProfile: setCorsHeaders(updateProfile),
    getAllUsers: setCorsHeaders(getAllUsers),
    getSingleUser: setCorsHeaders(getSingleUser),
    updateRole: setCorsHeaders(updateRole),
    deleteUser: setCorsHeaders(deleteUser),
  };
  