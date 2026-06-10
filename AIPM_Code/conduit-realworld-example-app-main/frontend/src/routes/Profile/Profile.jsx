import { Outlet, useLocation, useParams, Link } from "react-router-dom";
import AuthorInfo from "../../components/AuthorInfo";
import ContainerRow from "../../components/ContainerRow";
import NavItem from "../../components/NavItem";

function Profile() {
  const { state } = useLocation();
  const { username } = useParams();
  // 合并路由参数到状态中，保留原有状态的同时强制使用路由参数最新的username，避免刷新页面丢失状态、跨用户切换profile时状态不一致的问题
  const profileState = { ...(state ?? {}), username };

  return (
    <div className="profile-page">
      <div className="user-info">
        <ContainerRow>
          <AuthorInfo profile={profileState} />
        </ContainerRow>
      </div>

      <ContainerRow>
        <div className="col-md-9">
          <div className="articles-toggle">
            <ul className="nav nav-pills outline-active">
              <NavItem text="My Articles" url="" state={profileState} />
              <NavItem text="Favorited Articles" url="favorites" state={profileState} />
            </ul>
          </div>
          <Outlet />
        </div>
        <div className="col-md-3">
          <div className="sidebar">
            <p>Popular Tags</p>
            <div className="tag-list">
              {['Proposal Agent', 'PRD Draft', '需求确认周期', 'PRD返工率', '评审一次通过率', 'User Researcher', 'Technical Architect', 'UX Designer', 'Market Analyst', 'HCI Design', 'Product Metrics', 'Prototype', 'Dev Practice'].map(tag => (
                <Link key={tag} to={`/?tag=${tag}`} className="tag tag-pill tag-default">
                  {tag}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </ContainerRow>
    </div>
  );
}

export default Profile;