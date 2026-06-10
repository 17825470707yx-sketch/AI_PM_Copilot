import { useFeedContext } from "../../context/FeedContext";

function TagButton({ tag }) {
  const { changeTab } = useFeedContext();

  const handleClick = (e) => {
    changeTab(e, "tag");
  };

  return (
    <button className="tag-pill tag-default" key={tag} onClick={handleClick}>
      {tag}
    </button>
  );
}

export default TagButton;
