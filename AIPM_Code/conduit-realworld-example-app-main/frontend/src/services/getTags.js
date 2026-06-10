import axios from "axios";
import errorHandler from "../helpers/errorHandler";

async function getTags() {
  try {
    const { data } = await axios({ url: "/api/tags" });
    return data?.tags || [];
  } catch (error) {
    errorHandler(error);
    // 接口调用失败时绝对保证返回空数组，永远不会返回 undefined，彻底避免 .length 报错
    return [];
  }
}

export default getTags;
