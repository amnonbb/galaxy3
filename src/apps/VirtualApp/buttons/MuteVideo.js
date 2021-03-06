import React, {useState} from "react";
import {Videocam, VideocamOff} from "@material-ui/icons";
import {Tooltip, IconButton} from "@material-ui/core";

const MuteVideo = (props) => {
  const {action, isOn, disabled, t} = props;
  const handleAction = () => {
    action(isOn);
  };

  return (
    <Tooltip title={t(isOn ? "oldClient.startVideo" : "oldClient.stopVideo")} disableTouchListener={true}>
      <span>
        <IconButton
          aria-label={t(isOn ? "oldClient.startVideo" : "oldClient.stopVideo")}
          disabled={disabled}
          onClick={() => handleAction()}
        >
          {isOn ? <VideocamOff color="secondary" /> : <Videocam />}
        </IconButton>
      </span>
    </Tooltip>
  );
};

export {MuteVideo};
export default MuteVideo;
