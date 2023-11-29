<script lang="ts">
  export let data
</script>

<div>
  <form style="height: 48px; padding: 8px; border: 2px solid green;" action="?/counter" method="POST">
    <label>
      <span>Username</span>
      <input type="text" name="user">
    </label>
    <label>
      <span>Count</span>
      <input type="number" name="count">
    </label>
    <button>Submit</button>
  </form>

  <div style="width: 100%; border: 2px solid black; margin-block: 48px;"></div>

  <div>
    <h3>Users</h3>

    <div style="display: flex; gap: 4px; border: 2px solid red;">
      {#each data.users as user}
        <div style="border: 2px solid blue;">
          <p>
            <span>ID: </span>
            <span>{user.id}</span>
          </p>
          <p>{user.count}</p>
        </div>
      {/each}
    </div>
  </div>
</div>
