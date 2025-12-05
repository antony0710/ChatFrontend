import { Container, Stack, Flex, Button } from '@chakra-ui/react';
import { Link, Outlet } from 'react-router-dom';
const MyLayout = () => {

  return (
    <>
      <Container ml={0} mt={0}>
        <Container
          height={'5vh'}
          backgroundColor={'white'}
          zIndex={1}
          display={'flex'}
          position={'fixed'}>
          <Flex height={'1vh'}></Flex>
          <Stack
            direction={{ base: 'column', md: 'row' }}
            gap="20"
            display={'flex'}
            alignItems="center"
            padding={2}>
            <Link to="/">首頁</Link>
            <Link to="/first-page">First Page</Link>
            <Link to="/dys-chat">DYS Chat</Link>
          </Stack>
        </Container>
        <Container display={'flex'} flexDirection="row" top={'5vh'}>
          {['/', '/first-page', '/game-page1'].includes(location.pathname) && (
            <Container width={'20%'} padding={0} mt={5}>
              <Button></Button>
              {/* <DataList.Root orientation="horizontal">
                            {items.map((item) => (
                                <DataList.Item key={item.label}>
                                    <DataList.ItemLabel>{item['Name']}</DataList.ItemLabel>
                                </DataList.Item>
                            ))}
                        </DataList.Root> */}
            </Container>
          )}
          <Container>
            <Outlet></Outlet>

          </Container>
        </Container>
      </Container>
    </>
  );
};

export default MyLayout;
