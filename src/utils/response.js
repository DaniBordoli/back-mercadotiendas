const successResponse = (res, data, message = 'Success', status = 200) => {
  return res.status(status).json({
    success: true,
    message,
    data
  });
};

const errorResponse = (res, message = 'Error', status = 400, error = null) => {
  const response = {
    success: false,
    message
  };

  if (error) {
    response.error = error;
  }

  return res.status(status).json(response);
};

module.exports = {
  successResponse,
  errorResponse
};
