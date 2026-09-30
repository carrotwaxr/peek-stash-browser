import EntityListPage from "../list/EntityListPage";
import { IMAGE_LIST } from "../list/listPageConfigs";

/** The images list: the shared list page with the images config and its lightbox */
const Images = () => <EntityListPage config={IMAGE_LIST} />;

export default Images;
