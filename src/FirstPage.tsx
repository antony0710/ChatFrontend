import React from 'react';
import {Container} from '@chakra-ui/react';
import {Button} from '@chakra-ui/react';
import {useNavigate} from 'react-router-dom';
const FirstPage = () => {
  const navigate = useNavigate();
  return (
    <Container
      display="flex"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      height="100vh">
      <Button title="Sign in" onClick={() => navigate('Login')}>
        這是第一頁
      </Button>
      <p>這裡是你要顯示的內容。</p>
    </Container>
  );
};

export default FirstPage;
