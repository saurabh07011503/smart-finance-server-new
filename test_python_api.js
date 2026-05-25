const axios = require('axios');

console.log('Testing connection to Python API...\n');

axios.get('http://127.0.0.1:5001/api/predict-gold', {
  timeout: 10000,
  family: 4
})
  .then(response => {
    console.log('✅ SUCCESS! Python API is working');
    console.log('Response data:', JSON.stringify(response.data, null, 2));
  })
  .catch(error => {
    console.log('❌ ERROR connecting to Python API');
    console.log('Error message:', error.message);
    if (error.response) {
      console.log('Response status:', error.response.status);
      console.log('Response data:', error.response.data);
    } else if (error.request) {
      console.log('No response received');
      console.log('Request:', error.request);
    }
  });
