// Programmer Name     : Lim Wei Hau
// Program Name        : validators.js
// Description         : all the validations on the user inputs
// First Written on    : 25 December 2020
// Last Edited on      : 03 March 2021

const isEmpty = (string) => {
  return string.trim() === "";
};

const isHandle = (handle) => {
  const regEx = /^(?=.{4,20}$)(?![_.])(?!.*[_.]{2})[a-zA-Z0-9._]+(?<![_.])$/;
  return handle.match(regEx);
};

const isEmail = (email) => {
  const regEx =
    /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
  return email.match(regEx);
};

const isFullName = (fullName) => {
  const regEx = /^([a-zA-Z]{1,}[\s'-/]?[a-zA-Z]*){4,}$/;
  return fullName.match(regEx);
};

const isPhoneNo = (phoneNo) => {
  // /^(\+?6?01)[0-46-9]-*[0-9]{7,8}$/
  const regEx = /^(\+?6?01)[0-46-9]-*[0-9]{7,8}$/;
  return phoneNo.match(regEx);
};

exports.validateSignupData = (data) => {
  let errors = {};

  if (isEmpty(data.handle)) errors.handle = "Please complete this field";
  else if (!isHandle(data.handle))
    errors.handle = "<characters, numbers and '_' / '.' in between>";

  if (isEmpty(data.email)) errors.email = "Please complete this field";
  else if (!isEmail(data.email)) errors.email = "Please enter a valid email";
  else if (data.email.length > 60)
    errors.email = "Please enter a shorter email";

  if (isEmpty(data.password)) errors.password = "Please complete this field";
  else if (data.password.length > 50)
    errors.password = "Please enter a shorter password";

  if (data.password !== data.confirmPassword)
    errors.confirmPassword = "Passwords don't match";

  return { errors, valid: Object.keys(errors).length === 0 };
};

exports.validateLoginData = (user) => {
  let errors = {};

  if (isEmpty(user.email)) errors.email = "Please complete this field";
  if (isEmpty(user.password)) errors.password = "Please complete this field";

  return { errors, valid: Object.keys(errors).length === 0 };
};

exports.reduceUserDetails = (data) => {
  let errors = {};
  let userDetails = {};

  // mandatory details
  let { fullName, address, postcode, city, state } = data;

  // validate full name
  if (isEmpty(fullName)) errors.fullName = "Please complete this field";
  else if (!isFullName(fullName)) errors.fullName = "Please enter a valid name";
  else if (fullName.length > 65)
    errors.fullName = "Please enter a shorter name";

  // validate location
  if (isEmpty(address)) errors.address = "Please complete this field";
  else if (address.length > 100)
    errors.address = "Please enter a shorter address";

  if (isEmpty(postcode)) errors.postcode = "Please complete this field";
  else if (postcode.length !== 5 || isNaN(postcode))
    errors.postcode = "Please enter a valid Malaysia postcode";
  if (isEmpty(city)) errors.city = "Please complete this field";
  else if (city.length > 35) errors.city = "Please enter a shorter city name";
  if (isEmpty(state)) errors.state = "Please complete this field";

  // if user filled up all the details needed
  userDetails.fullName = fullName;
  userDetails.location = {
    address,
    postcode,
    city,
    state,
  };

  // additional details
  let { phoneNo, whatsappEnabled, facebook, instagram, bio } = data;
  userDetails.contact = {};
  // validate & reduce phone number
  if (phoneNo && !isEmpty(phoneNo)) {
    if (!isPhoneNo(phoneNo))
      errors.phoneNo = "Please enter a valid phone number";
    else {
      phoneNo = phoneNo.match(/\d/g).join("");
      if (phoneNo.charAt(0) !== "6") phoneNo = "6" + phoneNo;
    }

    userDetails.contact.phoneNo = phoneNo;
    userDetails.contact.whatsappEnabled = whatsappEnabled;
  }

  if (facebook && !isEmpty(facebook)) {
    if (facebook.includes("facebook.com")) {
      facebook = facebook.match(/facebook\.com\/([^/]*?)\/?$/)[1];
    }
    userDetails.contact.facebook = facebook;
  }

  if (instagram && !isEmpty(instagram)) {
    if (instagram.includes("instagram.com")) {
      instagram = instagram.match(/instagram\.com\/([^/]*?)\/?$/)[1];
    }
    userDetails.contact.instagram = instagram;
  }

  if (bio && !isEmpty(bio)) userDetails.bio = data.bio;

  return { userDetails, errors, valid: Object.keys(errors).length === 0 };
};

exports.validatePost = (postInfo) => {
  let errors = {};
  let { name, description, image, price } = postInfo;

  if (isEmpty(name)) errors.name = "Please complete this field";
  else if (name.length > 50) errors.name = "Please enter a shorter title";
  if (isEmpty(description)) errors.description = "Please complete this field";
  if (isEmpty(image)) errors.image = "Please complete this field";
  if (isEmpty(price)) errors.price = "Please complete this field";
  else if (isNaN(price)) errors.price = "NaN";
  else if (parseInt(price) > 999999) errors.price = "Lower!";

  return { errors, valid: Object.keys(errors).length === 0 };
};
