## Example usage
```yaml
version: "3"
services:
  xxscreeps:
    image: #TODO: image name here
    ports:
      - "21025:21025"
    volumes:
      - <your path to the .screepsrc.yaml you want to use>:/usr/app/xxscreeps/.screepsrc.yaml
# set this if you want to persist the content
#      - <path to persistence>:/usr/app/xxscreeps/screeps
```
Instruction on hos to set up the `.screepsrc.yaml` can be found 
[here](../README.md#getting-started)