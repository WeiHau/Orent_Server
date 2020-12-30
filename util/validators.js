const isEmpty = (string) => {
  return string.trim() === "";
};

const isEmail = (email) => {
  const regEx = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
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

  if (isEmpty(data.handle)) errors.handle = "Must not be empty";

  if (isEmpty(data.email)) {
    errors.email = "Must not be empty";
  } else if (!isEmail(data.email)) {
    errors.email = "Must be a valid email address";
  }

  if (isEmpty(data.password)) errors.password = "Must not be empty";

  if (data.password !== data.confirmPassword)
    errors.confirmPassword = "Passwords must match";

  return { errors, valid: Object.keys(errors).length === 0 };
};

exports.validateLoginData = (user) => {
  let errors = {};

  if (isEmpty(user.email)) errors.email = "Must not be empty";
  if (isEmpty(user.password)) errors.password = "Must not be empty";

  return { errors, valid: Object.keys(errors).length === 0 };
};

exports.reduceUserDetails = (data) => {
  let errors = {};
  let userDetails = {};

  // mandatory details
  let { fullName, phoneNo, address, postcode, city, state } = data;

  // validate full name
  if (isEmpty(fullName)) errors.fullName = "Must not be empty";
  else if (!isFullName(fullName)) errors.fullName = "Must be a valid full name";

  // validate & reduce phone number
  if (isEmpty(phoneNo)) errors.phoneNo = "Must not be empty";
  else if (!isPhoneNo(phoneNo)) errors.phoneNo = "Must be a valid phone number";
  else phoneNo = phoneNo.match(/\d/g).join("");

  // validate location
  if (isEmpty(address)) errors.address = "Must not be empty";
  if (isEmpty(postcode)) errors.postcode = "Must not be empty";
  else if (postcode.length !== 5 || isNaN(postcode))
    errors.postcode = "Must be a valid postcode";
  if (isEmpty(city)) errors.city = "Must not be empty";
  if (isEmpty(state)) errors.state = "Must not be empty";

  // if user filled up all the details needed
  userDetails.fullName = fullName;
  userDetails.contact = {};
  userDetails.contact.phoneNo = phoneNo;
  userDetails.contact.whatsappEnabled = data.whatsappEnabled;
  userDetails.location = {
    address,
    postcode,
    city,
    state,
  };

  // additional details
  let { facebook, instagram, bio } = data;
  userDetails.contact.socialMedia;
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

  if (isEmpty(name)) errors.name = "Must not be empty";
  if (isEmpty(description)) errors.description = "Must not be empty";
  if (isEmpty(image)) errors.image = "Must not be empty";
  if (isEmpty(price)) errors.price = "Must not be empty";
  else if (isNaN(price)) "Must be a valid price";

  return { errors, valid: Object.keys(errors).length === 0 };
};
