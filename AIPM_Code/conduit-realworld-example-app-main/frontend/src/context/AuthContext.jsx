import { createContext, useContext, useEffect, useState } from "react";

export const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

const savedUser = localStorage.getItem("loggedUser");
const initialState = savedUser ? JSON.parse(savedUser) : {
  headers: null,
  isAuth: false,
  loggedUser: {
    bio: null,
    email: "",
    image: null,
    token: "",
    username: "",
  },
};

function AuthProvider({ children }) {
  const [{ headers, isAuth, loggedUser }, setAuthState] = useState(initialState);

  const fetchCurrentUser = async () => {
    if (!headers) return;
    try {
      const getUser = (await import("../services/getUser")).default;
      const userData = await getUser({ headers });
      localStorage.setItem("loggedUser", JSON.stringify({ headers, isAuth: true, loggedUser: userData }));
      setAuthState((prev) => ({ ...prev, loggedUser: userData, isAuth: true }));
    } catch (err) {
      console.error("获取当前用户失败:", err);
    }
  };

  useEffect(() => {
    if (headers) {
      fetchCurrentUser();
    }
  }, [headers]);

  return (
    <AuthContext.Provider value={{ headers, isAuth, loggedUser, setAuthState, fetchCurrentUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export default AuthProvider;
