import { useMemo } from "react";
import type { NormalizedScene, WatchHistoryData } from "@peek/shared-types";
import { CardStatusIcons } from "../ui/index";

interface Props {
  scene: NormalizedScene;
  watchHistory?: WatchHistoryData | null;
  className?: string;
  centered?: boolean;
  isReadOnly?: boolean;
}

/**
 * Scene stats: o counter, play count, organized, resolution, file size
 */
const SceneStats = ({
  scene,
  watchHistory,
  className = "",
  centered = false,
  isReadOnly = false,
}: Props) => {
  const classNames = useMemo(() => {
    const classes = ["flex-nowrap"];
    if (centered) classes.push("justify-center");
    if (className) classes.push(className);
    return classes.join(" ");
  }, [centered, className]);

  return (
    <CardStatusIcons
      className={classNames}
      isReadOnly={isReadOnly}
      oCount={scene.o_counter}
      playCount={watchHistory?.playCount ?? scene.play_count}
      sceneId={scene.id}
    />
  );
};

export default SceneStats;
