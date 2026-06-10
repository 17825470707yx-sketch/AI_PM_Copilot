import { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "./AuthContext";
import getTags from "../services/getTags";

const FeedContext = createContext();

export function useFeedContext() {
  return useContext(FeedContext);
}

export { FeedContext };

function FeedProvider({ children }) {
  const { isAuth } = useAuth();
  const [{ tabName, tagName }, setTab] = useState({
    tabName: isAuth ? "feed" : "global",
    tagName: "",
  });
  const [tags, setTags] = useState(null);

  useEffect(() => {
    setTab((tab) => ({ ...tab, tabName: isAuth ? "feed" : "global" }));
  }, [isAuth]);

  useEffect(() => {
    getTags()
      .then((fetchedTags) => {
        setTags(fetchedTags || []);
      })
      .catch(() => {
        setTags([]);
      });
  }, []);

  const changeTab = async (e, tabName) => {
    const tagName = e.target.innerText.trim();
    setTab({ tabName, tagName });
  };

  return (
    <FeedContext.Provider value={{ changeTab, tabName, tagName, tags }}>
      {children}
    </FeedContext.Provider>
  );
}

export default FeedProvider;
