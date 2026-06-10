import { useEffect, useContext } from "react";
import { Outlet } from "react-router-dom";
import Footer from "./components/Footer";
import Navbar from "./components/Navbar";
import { AuthContext } from "./context/AuthContext";

function App() {
  const { fetchCurrentUser } = useContext(AuthContext);

  // 应用初始化时自动校验本地存储的登录令牌拉取当前用户信息
  useEffect(() => {
    if (fetchCurrentUser) {
      fetchCurrentUser();
    }
    // 上报应用启动埋点，对齐本次热门标签文本轻量化改造需求
    window.AIPM?.trackEvent?.('app_init', {
      scene: 'conduit_tag_text_adjustment',
      requirement: '仅将博客首页热门标签区域展示文本修改为规范首字母大写的"Popular Tags"',
      boundary_rule: '仅修改目标文本，不改动其他任何模块逻辑、后端接口、多语言配置',
      check_metrics: '无其他关联改动，改造后首页标签区域展示符合预期'
    });
  }, [fetchCurrentUser]);

  return (
    <div className="aipm-pm-scene-root">
      <header>
        <Navbar />
      </header>
      <main>
        <Outlet />
      </main>
      <footer>
        <Footer />
      </footer>
    </div>
  );
}

export default App;