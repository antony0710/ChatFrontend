import { useState } from 'react'
import { Button, Container, HStack } from "@chakra-ui/react"

function App() {
  const [count, setCount] = useState(0)

  return (
    <Container
      display="flex"
      flexDirection="column"
      justifyContent="center"
      alignItems="center"
      height="100vh"
    >
      <HStack>
        <Button colorScheme="blue" onClick={() => setCount(count + 1)}>
          Count is {count}
        </Button>
      </HStack>
    </Container>
  )
}

export default App
